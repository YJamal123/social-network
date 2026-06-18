"use server"

import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { query } from "@/lib/db"
import { isValidSchool } from "@/lib/schools"
import { isValidClassYear } from "@/lib/classYears"

export type RegisterState = { error?: string }

export async function register(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const username = (formData.get("username") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string
  const school = (formData.get("school") as string)?.trim()
  const classYearRaw = (formData.get("class_year") as string)?.trim()

  if (!username || !email || !password || !school || !classYearRaw) {
    return { error: "All fields are required" }
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" }
  }
  if (!isValidSchool(school)) {
    return { error: "Please choose a valid school" }
  }
  const classYear = Number(classYearRaw)
  if (!isValidClassYear(classYear)) {
    return { error: "Please choose a valid class year" }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    await query(
      "INSERT INTO users (username, email, password_hash, school, class_year) VALUES ($1, $2, $3, $4, $5)",
      [username, email, passwordHash, school, classYear]
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
