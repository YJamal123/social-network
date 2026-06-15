"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { query } from "@/lib/db"

export type RegisterState = { error?: string }

export async function register(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const username = (formData.get("username") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string

  if (!username || !email || !password) {
    return { error: "All fields are required" }
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
      [username, email, passwordHash]
    )
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "Username or email already taken" }
    }
    console.error("Register failed:", err)
    return { error: "Something went wrong" }
  }

  // redirect() throws internally — must be outside the try/catch
  redirect("/login")
}
