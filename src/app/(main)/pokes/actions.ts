"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
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
    await query(
      `INSERT INTO pokes (poker_id, pokee_id) VALUES ($1, $2)
       ON CONFLICT (poker_id, pokee_id)
       DO UPDATE SET created_at = now(), acknowledged = false`,
      [pokerId, targetId]
    )
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
    const result = await query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM pokes WHERE pokee_id = $1 AND acknowledged = false",
      [session.user.id]
    )
    return result.rows[0]?.count ?? 0
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
    await query(
      `INSERT INTO pokes (poker_id, pokee_id) VALUES ($1, $2)
       ON CONFLICT (poker_id, pokee_id)
       DO UPDATE SET created_at = now(), acknowledged = false`,
      [meId, pokerId]
    )
    await query(
      "UPDATE pokes SET acknowledged = true WHERE poker_id = $1 AND pokee_id = $2",
      [pokerId, meId]
    )
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
    await query(
      "UPDATE pokes SET acknowledged = true WHERE pokee_id = $1 AND acknowledged = false",
      [session.user.id]
    )
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

  const result = await query<PokeWithPoker>(
    `SELECT p.poker_id, p.pokee_id, p.created_at, p.acknowledged,
            u.username AS poker_username
     FROM pokes p
     JOIN users u ON u.id = p.poker_id
     WHERE p.pokee_id = $1
     ORDER BY p.created_at DESC`,
    [session.user.id]
  )
  return result.rows
}
