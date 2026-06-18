"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
import type { PokeWithPoker } from "@/lib/types"

export type PokeState = { error?: string }

// Poke another user. Upserts so re-poking refreshes the timestamp and resets
// the acknowledged flag. Self-poke is silently ignored. Revalidates the target
// profile and the /pokes page so indicators stay in sync.
export async function poke(targetId: string): Promise<PokeState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const pokerId = session.user.id
  if (pokerId === targetId) {
    // Ignore self-poke — not an error, just a no-op.
    return {}
  }

  try {
    // Upsert: re-poking refreshes created_at and resets acknowledged. The update
    // branch must set these explicitly — Prisma does not auto-bump created_at.
    await getPrisma().poke.upsert({
      where: { pokerId_pokeeId: { pokerId, pokeeId: targetId } },
      create: { pokerId, pokeeId: targetId },
      update: { createdAt: new Date(), acknowledged: false },
    })
  } catch (err) {
    console.error("Poke failed:", err)
    return { error: "Failed to poke" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/pokes")
  return {}
}

// Count pokes aimed at the current user that they haven't acknowledged yet.
// Used by the SiteHeader indicator. Returns 0 when logged out or on error.
export async function getUnacknowledgedPokeCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) {
    return 0
  }

  try {
    return await getPrisma().poke.count({
      where: { pokeeId: session.user.id, acknowledged: false },
    })
  } catch (err) {
    console.error("Count pokes failed:", err)
    return 0
  }
}

// Poke someone back: poke them AND acknowledge the poke they sent us, in one
// step. Used by the "Poke back" button on the /pokes page. Self is impossible
// here (you can't appear in your own pokers list). Revalidates so both the
// indicator and the list update.
export async function pokeBack(pokerId: string): Promise<PokeState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const meId = session.user.id
  if (pokerId === meId) {
    return {}
  }

  try {
    const prisma = getPrisma()
    await prisma.poke.upsert({
      where: { pokerId_pokeeId: { pokerId: meId, pokeeId: pokerId } },
      create: { pokerId: meId, pokeeId: pokerId },
      update: { createdAt: new Date(), acknowledged: false },
    })
    // updateMany (not update) so a missing row is a silent no-op, matching the
    // old UPDATE … WHERE semantics (update() would throw P2025 on no row).
    await prisma.poke.updateMany({
      where: { pokerId, pokeeId: meId },
      data: { acknowledged: true },
    })
  } catch (err) {
    console.error("Poke back failed:", err)
    return { error: "Failed to poke back" }
  }

  revalidatePath("/profile/[username]", "page")
  revalidatePath("/pokes")
  return {}
}

// Mark every poke aimed at the current user as acknowledged so the SiteHeader
// indicator clears. Called when the /pokes page is viewed.
export async function acknowledgePokes(): Promise<PokeState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  try {
    await getPrisma().poke.updateMany({
      where: { pokeeId: session.user.id, acknowledged: false },
      data: { acknowledged: true },
    })
  } catch (err) {
    console.error("Acknowledge pokes failed:", err)
    return { error: "Failed to acknowledge pokes" }
  }

  revalidatePath("/pokes")
  return {}
}

// List everyone who has poked the current user, joined with the poker's
// username, newest first. Used by the /pokes page.
export async function getPokers(): Promise<PokeWithPoker[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  return getPrisma().$queryRaw<PokeWithPoker[]>`
    SELECT p.poker_id, p.pokee_id, p.created_at, p.acknowledged,
           u.username AS poker_username
    FROM pokes p
    JOIN users u ON u.id = p.poker_id
    WHERE p.pokee_id = ${session.user.id}::uuid
    ORDER BY p.created_at DESC`
}
