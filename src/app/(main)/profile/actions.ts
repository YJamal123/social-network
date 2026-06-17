"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { validatePostContent } from "@/lib/validation"
import { isValidSchool } from "@/lib/schools"
import type { WallPostWithAuthor } from "@/lib/types"

export type ProfileState = { error?: string }

const MAX_BIO = 280
const MAX_RELATIONSHIP = 50
const MAX_INTERESTS = 280
const MAX_COURSES = 280

// Profile edit. Username is intentionally not editable here: it's baked into
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

  const relationshipStatus = (
    (formData.get("relationship_status") as string) ?? ""
  ).trim()
  if (relationshipStatus.length > MAX_RELATIONSHIP) {
    return {
      error: `Relationship status must be ${MAX_RELATIONSHIP} characters or fewer`,
    }
  }

  const interests = ((formData.get("interests") as string) ?? "").trim()
  if (interests.length > MAX_INTERESTS) {
    return { error: `Interests must be ${MAX_INTERESTS} characters or fewer` }
  }

  const courses = ((formData.get("courses") as string) ?? "").trim()
  if (courses.length > MAX_COURSES) {
    return { error: `Courses must be ${MAX_COURSES} characters or fewer` }
  }

  const school = ((formData.get("school") as string) ?? "").trim()
  if (!isValidSchool(school)) {
    return { error: "Please select a valid school" }
  }

  try {
    await query(
      `UPDATE users
          SET bio = $1,
              relationship_status = $2,
              interests = $3,
              courses = $4,
              school = $5
        WHERE id = $6`,
      [
        bio || null,
        relationshipStatus || null,
        interests || null,
        courses || null,
        school,
        session.user.id,
      ]
    )
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

export type AvatarState = { error?: string }

const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]

// Upload (or replace) the current user's profile picture. Owner-only: always
// writes to the session user's own row. Stored as bytea in Cloud SQL and served
// by /api/avatar/[id].
export async function uploadAvatar(
  formData: FormData
): Promise<AvatarState> {
  const session = await auth()
  if (!session?.user?.id || !session.user.name) {
    return { error: "You must be logged in" }
  }

  const file = formData.get("avatar")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose an image" }
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return { error: "Image must be JPEG, PNG, WebP, or GIF" }
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Image must be 2MB or smaller" }
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    await query("UPDATE users SET avatar = $1, avatar_mime = $2 WHERE id = $3", [
      bytes,
      file.type,
      session.user.id,
    ])
  } catch (err) {
    console.error("Avatar upload failed:", err)
    return { error: "Failed to upload image" }
  }

  revalidatePath(`/profile/${session.user.name}`)
  revalidatePath("/feed")
  return {}
}
