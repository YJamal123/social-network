"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
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
    const prisma = getPrisma()
    // If the target already requested ME, confirm that row instead of opening a
    // duplicate in the other direction.
    const reverse = await prisma.friendship.findUnique({
      where: {
        requesterId_addresseeId: { requesterId: targetId, addresseeId: meId },
      },
      select: { confirmed: true },
    })
    if (reverse && reverse.confirmed === false) {
      await prisma.friendship.update({
        where: {
          requesterId_addresseeId: { requesterId: targetId, addresseeId: meId },
        },
        data: { confirmed: true },
      })
    } else {
      // ON CONFLICT DO NOTHING — an upsert with an empty update leaves any
      // existing row untouched (and creates it if absent).
      await prisma.friendship.upsert({
        where: {
          requesterId_addresseeId: { requesterId: meId, addresseeId: targetId },
        },
        create: { requesterId: meId, addresseeId: targetId, confirmed: false },
        update: {},
      })
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
    await getPrisma().friendship.updateMany({
      where: { requesterId, addresseeId: meId },
      data: { confirmed: true },
    })
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
    await getPrisma().friendship.deleteMany({
      where: { requesterId, addresseeId: meId, confirmed: false },
    })
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
    await getPrisma().friendship.deleteMany({
      where: {
        OR: [
          { requesterId: meId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: meId },
        ],
      },
    })
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

  return getPrisma().$queryRaw<FriendshipWithUser[]>`
    SELECT f.requester_id, f.addressee_id, f.confirmed, f.created_at,
           u.id AS user_id, u.username
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ${session.user.id}::uuid AND f.confirmed = false
    ORDER BY f.created_at DESC`
}

// Confirmed friends of the given user, both directions, joined with the OTHER
// user's username + id, newest first.
export async function getFriends(userId: string): Promise<FriendshipWithUser[]> {
  return getPrisma().$queryRaw<FriendshipWithUser[]>`
    SELECT f.requester_id, f.addressee_id, f.confirmed, f.created_at,
           u.id AS user_id, u.username
    FROM friendships f
    JOIN users u
      ON u.id = CASE WHEN f.requester_id = ${userId}::uuid
                     THEN f.addressee_id ELSE f.requester_id END
    WHERE f.confirmed = true
      AND (f.requester_id = ${userId}::uuid OR f.addressee_id = ${userId}::uuid)
    ORDER BY f.created_at DESC`
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

  const row = await getPrisma().friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
    select: { requesterId: true, confirmed: true },
  })
  if (!row) return "none"
  if (row.confirmed) return "friends"
  return row.requesterId === viewerId ? "pending_out" : "pending_in"
}

// Count incoming, unconfirmed friend requests aimed at the current user. Used by
// the SiteHeader badge. Returns 0 when logged out or on error.
export async function getPendingFriendRequestCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) {
    return 0
  }

  try {
    return await getPrisma().friendship.count({
      where: { addresseeId: session.user.id, confirmed: false },
    })
  } catch (err) {
    console.error("Count friend requests failed:", err)
    return 0
  }
}
