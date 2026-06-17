// Pure whitelists + helpers for the verbatim 2004 profile fields
// "Interested In" and "Looking For" — no DB, no auth, no side effects.
// Both are stored comma-joined (exactly like `interests`); these helpers own
// the canonical option sets, server-side sanitisation, and parsing the stored
// string back into checkbox state. Trivially unit-testable.

export const INTERESTED_IN = ["Men", "Women"] as const

export const LOOKING_FOR = [
  "Friendship",
  "A relationship",
  "Dating",
  "Whatever I can get",
  "Random play",
] as const

export type InterestedIn = (typeof INTERESTED_IN)[number]
export type LookingFor = (typeof LOOKING_FOR)[number]

// Filter raw form values down to the whitelist (preserving whitelist order,
// deduped) and comma-join into the storage string. Anything not on the
// whitelist is dropped. Returns "" when nothing valid is selected.
export function sanitizeSelections(
  raw: unknown,
  whitelist: readonly string[]
): string {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  const chosen = new Set(values.filter((v): v is string => typeof v === "string"))
  return whitelist.filter((opt) => chosen.has(opt)).join(", ")
}

// Parse a stored comma-joined string back into the set of selected options.
// Inverse of sanitizeSelections — used to pre-check the edit-form checkboxes.
export function parseSelections(stored: string | null | undefined): string[] {
  if (!stored) return []
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
