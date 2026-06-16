"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { validatePostContent } from "@/lib/validation"

export type PostState = { error?: string }

export async function createPost(content: string): Promise<PostState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in to post" }
  }

  const result = validatePostContent(content)
  if (!result.ok) {
    return { error: result.error }
  }

  try {
    await query("INSERT INTO posts (user_id, content) VALUES ($1, $2)", [
      session.user.id,
      result.value,
    ])
  } catch (err) {
    console.error("Create post failed:", err)
    return { error: "Failed to publish post" }
  }

  revalidatePath("/feed")
  return {}
}

export type LikeState = { error?: string }

// Toggle a like on a post: insert if not liked, delete if already liked.
// Revalidates the feed and profile pages so counts stay in sync.
export async function toggleLike(postId: string): Promise<LikeState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const userId = session.user.id

  try {
    const existing = await query(
      "SELECT 1 FROM likes WHERE user_id = $1 AND post_id = $2",
      [userId, postId]
    )
    if (existing.rowCount && existing.rowCount > 0) {
      await query("DELETE FROM likes WHERE user_id = $1 AND post_id = $2", [
        userId,
        postId,
      ])
    } else {
      await query("INSERT INTO likes (user_id, post_id) VALUES ($1, $2)", [
        userId,
        postId,
      ])
    }
  } catch (err) {
    console.error("Toggle like failed:", err)
    return { error: "Failed to update like" }
  }

  revalidatePath("/feed")
  revalidatePath("/profile/[username]", "page")
  return {}
}
