// Pure relationship-status whitelist — no DB, no auth, no side effects.
// A linked relationship carries one of these canonical statuses; this is the
// whitelist used by proposeRelationship and the ProfileEditForm <select>, and
// is trivially testable.

export const RELATIONSHIP_STATUSES = [
  "In a relationship",
  "It's complicated",
  "Married",
  "In an open relationship",
] as const

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]

/** True if `s` is exactly one of the canonical relationship statuses. */
export function isValidRelationshipStatus(s: unknown): s is RelationshipStatus {
  return (
    typeof s === "string" &&
    (RELATIONSHIP_STATUSES as readonly string[]).includes(s)
  )
}
