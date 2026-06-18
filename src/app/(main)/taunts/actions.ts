"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
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
    const prisma = getPrisma()
    const schools = await prisma.user.findMany({
      where: { id: { in: [taunterId, targetId] } },
      select: { id: true, school: true },
    })
    const taunterSchool = schools.find((r) => r.id === taunterId)?.school ?? null
    const taunteeSchool = schools.find((r) => r.id === targetId)?.school ?? null
    if (!taunterSchool || !taunteeSchool || taunterSchool === taunteeSchool) {
      return { error: "You can only taunt rival schools" }
    }

    await prisma.taunt.upsert({
      where: { taunterId_taunteeId: { taunterId, taunteeId: targetId } },
      create: { taunterId, taunteeId: targetId },
      update: { createdAt: new Date(), acknowledged: false },
    })
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
    return await getPrisma().taunt.count({
      where: { taunteeId: session.user.id, acknowledged: false },
    })
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
    const prisma = getPrisma()
    const schools = await prisma.user.findMany({
      where: { id: { in: [meId, taunterId] } },
      select: { id: true, school: true },
    })
    const meSchool = schools.find((r) => r.id === meId)?.school ?? null
    const themSchool = schools.find((r) => r.id === taunterId)?.school ?? null
    if (!meSchool || !themSchool || meSchool === themSchool) {
      return { error: "You can only taunt rival schools" }
    }

    await prisma.taunt.upsert({
      where: { taunterId_taunteeId: { taunterId: meId, taunteeId: taunterId } },
      create: { taunterId: meId, taunteeId: taunterId },
      update: { createdAt: new Date(), acknowledged: false },
    })
    // updateMany so a missing row is a silent no-op (matches old UPDATE … WHERE).
    await prisma.taunt.updateMany({
      where: { taunterId, taunteeId: meId },
      data: { acknowledged: true },
    })
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
    await getPrisma().taunt.updateMany({
      where: { taunteeId: session.user.id, acknowledged: false },
      data: { acknowledged: true },
    })
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

  return getPrisma().$queryRaw<TauntWithTaunter[]>`
    SELECT t.taunter_id, t.tauntee_id, t.created_at, t.acknowledged,
           u.username AS taunter_username, u.school AS taunter_school
    FROM taunts t
    JOIN users u ON u.id = t.taunter_id
    WHERE t.tauntee_id = ${session.user.id}::uuid
    ORDER BY t.created_at DESC`
}

// The current viewer's own school, used to anchor the head-to-head scoreboard.
// Returns null when logged out, school unset, or on error.
export async function getViewerSchool(): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  try {
    const row = await getPrisma().user.findUnique({
      where: { id: session.user.id },
      select: { school: true },
    })
    return row?.school ?? null
  } catch (err) {
    console.error("Get viewer school failed:", err)
    return null
  }
}

// Head-to-head taunt tally between two rival schools. Counts cross-school taunts
// launched BY each side against the other and returns them as { a, b } keyed to
// the argument order. Used for the "SchoolA N — M SchoolB" scoreboard. Returns
// zeroes on error so the page still renders.
export async function getHeadToHead(
  schoolA: string,
  schoolB: string
): Promise<{ a: number; b: number }> {
  try {
    const rows = await getPrisma().$queryRaw<
      { school: string; count: number }[]
    >`
      SELECT tr.school AS school, COUNT(*)::int AS count
      FROM taunts t
      JOIN users tr ON tr.id = t.taunter_id
      JOIN users te ON te.id = t.tauntee_id
      WHERE tr.school IN (${schoolA}, ${schoolB})
        AND te.school IN (${schoolA}, ${schoolB})
        AND tr.school <> te.school
      GROUP BY tr.school`
    const a = rows.find((r) => r.school === schoolA)?.count ?? 0
    const b = rows.find((r) => r.school === schoolB)?.count ?? 0
    return { a, b }
  } catch (err) {
    console.error("Head-to-head failed:", err)
    return { a: 0, b: 0 }
  }
}
