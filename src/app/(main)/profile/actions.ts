"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { validatePostContent } from "@/lib/validation"
import type { WallPostWithAuthor } from "@/lib/types"

export type ProfileState = { error?: string }

const MAX_BIO = 280

// Bio-only edit. Username is intentionally not editable here: it's baked into
// the JWT (session.user.name) and would go stale until re-login.
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const session = await auth()
  if (!session?.user?.id || !session.user.name) {
    return { error: "You must be logged in" }
  }

  const bio = ((formData.get("bio") as string) ?? "").trim()
  if (bio.length > MAX_BIO) {
    return { error: `Bio must be ${MAX_BIO} characters or fewer` }
  }

  try {
    await query("UPDATE users SET bio = $1 WHERE id = $2", [
      bio || null,
      session.user.id,
    ])
  } catch (err) {
    console.error("Update profile failed:", err)
    return { error: "Failed to update profile" }
  }

  const username = session.user.name
  revalidatePath(`/profile/${username}`)
  // redirect() throws internally — must live outside the try/catch
  redirect(`/profile/${username}`)
}

export type FollowState = { error?: string }

// Toggle following a user: insert if not following, delete if following.
// Self-follow is silently ignored. Revalidates the feed and profile pages.
export async function toggleFollow(targetUserId: string): Promise<FollowState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const followerId = session.user.id
  if (followerId === targetUserId) {
    // Ignore self-follow — not an error, just a no-op.
    return {}
  }

  try {
    const existing = await query(
      "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
      [followerId, targetUserId]
    )
    if (existing.rowCount && existing.rowCount > 0) {
      await query(
        "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
        [followerId, targetUserId]
      )
    } else {
      await query(
        "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)",
        [followerId, targetUserId]
      )
    }
  } catch (err) {
    console.error("Toggle follow failed:", err)
    return { error: "Failed to update follow" }
  }

  revalidatePath("/feed")
  revalidatePath("/profile/[username]", "page")
  return {}
}

export type WallState = { error?: string }

// Post to a user's wall. Anyone logged in may post to any wall (including their
// own). Validates content like a post (non-empty, ≤280) and revalidates the
// profile page so the new wall post shows immediately.
export async function postToWall(
  ownerId: string,
  content: string
): Promise<WallState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in to post" }
  }

  const result = validatePostContent(content)
  if (!result.ok) {
    return { error: result.error }
  }

  try {
    await query(
      "INSERT INTO wall_posts (owner_id, author_id, content) VALUES ($1, $2, $3)",
      [ownerId, session.user.id, result.value]
    )
  } catch (err) {
    console.error("Post to wall failed:", err)
    return { error: "Failed to post to wall" }
  }

  revalidatePath("/profile/[username]", "page")
  return {}
}

// Fetch all wall posts written ON the given owner's profile, joined with the
// author's username, newest first.
export async function getWallPosts(
  ownerId: string
): Promise<WallPostWithAuthor[]> {
  const result = await query<WallPostWithAuthor>(
    `SELECT w.id, w.owner_id, w.author_id, w.content, w.created_at,
            u.username AS author_username
     FROM wall_posts w
     JOIN users u ON u.id = w.author_id
     WHERE w.owner_id = $1
     ORDER BY w.created_at DESC`,
    [ownerId]
  )
  return result.rows
}
