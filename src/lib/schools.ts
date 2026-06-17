// Pure school/whitelist helpers — no DB, no auth, no side effects.
// The network is segmented by Ivy League school; this is the canonical
// whitelist used at both register and updateProfile, and is trivially testable.

export const SCHOOLS = [
  "Brown",
  "Columbia",
  "Cornell",
  "Dartmouth",
  "Harvard",
  "Penn",
  "Princeton",
  "Yale",
] as const

export type School = (typeof SCHOOLS)[number]

/** True if `s` is exactly one of the eight Ivy League schools. */
export function isValidSchool(s: unknown): s is School {
  return typeof s === "string" && (SCHOOLS as readonly string[]).includes(s)
}
