"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import type { FriendshipState, FriendshipWithUser } from "@/lib/types"

export type FriendState = { error?: string }

// Send a friend request to another user. Symmetric semantics: ONE row per pair.
// Self-request is silently ignored. If the target already sent ME a pending
// request (reverse row exists), just confirm it — that completes the handshake.
// Otherwise upsert an unconfirmed (me, target) row. Revalidates the target
// profile + /friends so indicators stay in sync.
export async function sendFriendRequest(targetId: string): Promise<FriendState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (meId === targetId) {
    // Ignore self-request — not an error, just a no-op.
    return {}
  }

  try {
    // If the target already requested ME, confirm that row instead of opening a
    // duplicate in the other direction.
    const reverse = await query(
      "SELECT 1 FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND confirmed = false",
      [targetId, meId]
    )
    if (reverse.rowCount && reverse.rowCount > 0) {
      await query(
        "UPDATE friendships SET confirmed = true WHERE requester_id = $1 AND addressee_id = $2",
        [targetId, meId]
      )
    } else {
      await query(
        `INSERT INTO friendships (requester_id, addressee_id, confirmed)
         VALUES ($1, $2, false)
         ON CONFLICT (requester_id, addressee_id) DO NOTHING`,
        [meId, targetId]
      )
    }
  } catch (err) {
    console.error("Send friend request failed:", err)
    return { error: "Failed to send friend request" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/friends")
  return {}
}

// Confirm a friend request sent TO the current user. Sets confirmed=true on the
// row where the current user is the addressee. Revalidates so the indicator and
// profile button update.
export async function confirmFriend(requesterId: string): Promise<FriendState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (requesterId === meId) {
    return {}
  }

  try {
    await query(
      "UPDATE friendships SET confirmed = true WHERE requester_id = $1 AND addressee_id = $2",
      [requesterId, meId]
    )
  } catch (err) {
    console.error("Confirm friend failed:", err)
    return { error: "Failed to confirm friend" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/friends")
  return {}
}

// Decline a friend request sent TO the current user. Deletes the pending row.
export async function declineFriend(requesterId: string): Promise<FriendState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (requesterId === meId) {
    return {}
  }

  try {
    await query(
      "DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND confirmed = false",
      [requesterId, meId]
    )
  } catch (err) {
    console.error("Decline friend failed:", err)
    return { error: "Failed to decline friend" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/friends")
  return {}
}

// Remove a friendship (or cancel a pending request) in either direction. Deletes
// whichever direction row exists between me and the other user.
export async function removeFriend(otherId: string): Promise<FriendState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (otherId === meId) {
    return {}
  }

  try {
    await query(
      `DELETE FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)`,
      [meId, otherId]
    )
  } catch (err) {
    console.error("Remove friend failed:", err)
    return { error: "Failed to remove friend" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/friends")
  return {}
}

// Incoming friend requests aimed at the current user awaiting confirmation,
// joined with the requester's username + id, newest first.
export async function getPendingFriendRequests(): Promise<FriendshipWithUser[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  const result = await query<FriendshipWithUser>(
    `SELECT f.requester_id, f.addressee_id, f.confirmed, f.created_at,
            u.id AS user_id, u.username
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.confirmed = false
     ORDER BY f.created_at DESC`,
    [session.user.id]
  )
  return result.rows
}

// Confirmed friends of the given user, both directions, joined with the OTHER
// user's username + id, newest first.
export async function getFriends(userId: string): Promise<FriendshipWithUser[]> {
  const result = await query<FriendshipWithUser>(
    `SELECT f.requester_id, f.addressee_id, f.confirmed, f.created_at,
            u.id AS user_id, u.username
     FROM friendships f
     JOIN users u
       ON u.id = CASE WHEN f.requester_id = $1
                      THEN f.addressee_id ELSE f.requester_id END
     WHERE f.confirmed = true
       AND (f.requester_id = $1 OR f.addressee_id = $1)
     ORDER BY f.created_at DESC`,
    [userId]
  )
  return result.rows
}

// The viewer's friendship state with another user, from the viewer's POV.
// 'friends' if a confirmed row exists either direction; 'pending_out' if the
// viewer sent an unconfirmed request; 'pending_in' if the other user did; else
// 'none'. Self always resolves to 'none'.
export async function getFriendshipState(
  viewerId: string,
  otherId: string
): Promise<FriendshipState> {
  if (viewerId === otherId) {
    return "none"
  }

  const result = await query<{ requester_id: string; confirmed: boolean }>(
    `SELECT requester_id, confirmed FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)
      LIMIT 1`,
    [viewerId, otherId]
  )
  const row = result.rows[0]
  if (!row) return "none"
  if (row.confirmed) return "friends"
  return row.requester_id === viewerId ? "pending_out" : "pending_in"
}

// Count incoming, unconfirmed friend requests aimed at the current user. Used by
// the SiteHeader badge. Returns 0 when logged out or on error.
export async function getPendingFriendRequestCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) {
    return 0
  }

  try {
    const result = await query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM friendships WHERE addressee_id = $1 AND confirmed = false",
      [session.user.id]
    )
    return result.rows[0]?.count ?? 0
  } catch (err) {
    console.error("Count friend requests failed:", err)
    return 0
  }
}
