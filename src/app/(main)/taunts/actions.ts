"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import type { TauntWithTaunter } from "@/lib/types"

export type TauntState = { error?: string }

// Taunt another user. Cross-school variant of poke: only allowed between users
// at DIFFERENT schools (and both must have a school set). Upserts so re-taunting
// refreshes the timestamp and resets the acknowledged flag. Self-taunt is
// silently ignored. Revalidates the target profile and the /taunts page.
export async function taunt(targetId: string): Promise<TauntState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const taunterId = session.user.id
  if (taunterId === targetId) {
    // Ignore self-taunt — not an error, just a no-op.
    return {}
  }

  try {
    const schools = await query<{ id: string; school: string | null }>(
      "SELECT id, school FROM users WHERE id IN ($1, $2)",
      [taunterId, targetId]
    )
    const taunterSchool = schools.rows.find((r) => r.id === taunterId)?.school ?? null
    const taunteeSchool = schools.rows.find((r) => r.id === targetId)?.school ?? null
    if (!taunterSchool || !taunteeSchool || taunterSchool === taunteeSchool) {
      return { error: "You can only taunt rival schools" }
    }

    await query(
      `INSERT INTO taunts (taunter_id, tauntee_id) VALUES ($1, $2)
       ON CONFLICT (taunter_id, tauntee_id)
       DO UPDATE SET created_at = now(), acknowledged = false`,
      [taunterId, targetId]
    )
  } catch (err) {
    console.error("Taunt failed:", err)
    return { error: "Failed to taunt" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/taunts")
  return {}
}

// Count taunts aimed at the current user that they haven't acknowledged yet.
// Used by the SiteHeader indicator. Returns 0 when logged out or on error.
export async function getUnacknowledgedTauntCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) {
    return 0
  }

  try {
    const result = await query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM taunts WHERE tauntee_id = $1 AND acknowledged = false",
      [session.user.id]
    )
    return result.rows[0]?.count ?? 0
  } catch (err) {
    console.error("Count taunts failed:", err)
    return 0
  }
}

// Taunt someone back: taunt them AND acknowledge the taunt they sent us, in one
// step. Used by the "Taunt back" button on the /taunts page. Self is impossible
// here (you can't appear in your own taunters list). The cross-school guard
// still applies. Revalidates so both the indicator and the list update.
export async function tauntBack(taunterId: string): Promise<TauntState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (taunterId === meId) {
    return {}
  }

  try {
    const schools = await query<{ id: string; school: string | null }>(
      "SELECT id, school FROM users WHERE id IN ($1, $2)",
      [meId, taunterId]
    )
    const meSchool = schools.rows.find((r) => r.id === meId)?.school ?? null
    const themSchool = schools.rows.find((r) => r.id === taunterId)?.school ?? null
    if (!meSchool || !themSchool || meSchool === themSchool) {
      return { error: "You can only taunt rival schools" }
    }

    await query(
      `INSERT INTO taunts (taunter_id, tauntee_id) VALUES ($1, $2)
       ON CONFLICT (taunter_id, tauntee_id)
       DO UPDATE SET created_at = now(), acknowledged = false`,
      [meId, taunterId]
    )
    await query(
      "UPDATE taunts SET acknowledged = true WHERE taunter_id = $1 AND tauntee_id = $2",
      [taunterId, meId]
    )
  } catch (err) {
    console.error("Taunt back failed:", err)
    return { error: "Failed to taunt back" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/taunts")
  return {}
}

// Mark every taunt aimed at the current user as acknowledged so the SiteHeader
// indicator clears. Called when the /taunts page is viewed.
export async function acknowledgeTaunts(): Promise<TauntState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  try {
    await query(
      "UPDATE taunts SET acknowledged = true WHERE tauntee_id = $1 AND acknowledged = false",
      [session.user.id]
    )
  } catch (err) {
    console.error("Acknowledge taunts failed:", err)
    return { error: "Failed to acknowledge taunts" }
  }

  revalidatePath("/taunts")
  return {}
}

// List everyone who has taunted the current user, joined with the taunter's
// username + school, newest first. Used by the /taunts page.
export async function getTaunters(): Promise<TauntWithTaunter[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  const result = await query<TauntWithTaunter>(
    `SELECT t.taunter_id, t.tauntee_id, t.created_at, t.acknowledged,
            u.username AS taunter_username, u.school AS taunter_school
     FROM taunts t
     JOIN users u ON u.id = t.taunter_id
     WHERE t.tauntee_id = $1
     ORDER BY t.created_at DESC`,
    [session.user.id]
  )
  return result.rows
}
