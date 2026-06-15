"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"

export type PostState = { error?: string }

export async function createPost(content: string): Promise<PostState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in to post" }
  }

  const trimmed = content.trim()
  if (!trimmed) {
    return { error: "Post cannot be empty" }
  }
  if (trimmed.length > 280) {
    return { error: "Post must be 280 characters or fewer" }
  }

  try {
    await query("INSERT INTO posts (user_id, content) VALUES ($1, $2)", [
      session.user.id,
      trimmed,
    ])
  } catch (err) {
    console.error("Create post failed:", err)
    return { error: "Failed to publish post" }
  }

  revalidatePath("/feed")
  return {}
}
