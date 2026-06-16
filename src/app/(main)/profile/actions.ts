"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"

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
