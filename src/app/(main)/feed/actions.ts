"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
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
    await getPrisma().post.create({
      data: { userId: session.user.id, content: result.value },
    })
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
    const prisma = getPrisma()
    const where = { userId_postId: { userId, postId } }
    const existing = await prisma.like.findUnique({ where })
    if (existing) {
      await prisma.like.delete({ where })
    } else {
      await prisma.like.create({ data: { userId, postId } })
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
    await getPrisma().comment.create({
      data: { postId, userId: session.user.id, content: result.value },
    })
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
    const comments = await getPrisma().$queryRaw<CommentWithAuthor[]>`
      SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, u.username
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ${postId}::uuid
      ORDER BY c.created_at ASC`
    return { comments }
  } catch (err) {
    console.error("Get comments failed:", err)
    return { error: "Failed to load comments" }
  }
}
