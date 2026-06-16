"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { validateComment, validatePostContent } from "@/lib/validation"
import type { CommentWithAuthor } from "@/lib/types"

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

export type CommentState = { error?: string }

// Add a comment to a post. Validates content (non-empty, ≤280) and revalidates
// the feed and profile pages so the comment count stays in sync.
export async function addComment(
  postId: string,
  content: string
): Promise<CommentState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in to comment" }
  }

  const result = validateComment(content)
  if (!result.ok) {
    return { error: result.error }
  }

  try {
    await query(
      "INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)",
      [postId, session.user.id, result.value]
    )
  } catch (err) {
    console.error("Add comment failed:", err)
    return { error: "Failed to add comment" }
  }

  revalidatePath("/feed")
  revalidatePath("/profile/[username]", "page")
  return {}
}

export type CommentsResult = { comments?: CommentWithAuthor[]; error?: string }

// Fetch all comments for a post, joined with the author's username, oldest first.
export async function getComments(postId: string): Promise<CommentsResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  try {
    const result = await query<CommentWithAuthor>(
      `SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, u.username
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    )
    return { comments: result.rows }
  } catch (err) {
    console.error("Get comments failed:", err)
    return { error: "Failed to load comments" }
  }
}
