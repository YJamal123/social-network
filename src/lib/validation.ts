// Pure validation helpers — no DB, no auth, no side effects.
// Kept framework-free so they're trivially unit-testable and reusable
// across server actions (post creation, profile edit).

export const MAX_POST_LENGTH = 280
export const MAX_BIO_LENGTH = 280

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string }

/** Validate user-submitted post content. Mirrors the rules enforced in createPost. */
export function validatePostContent(content: string): ValidationResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, error: "Post cannot be empty" }
  }
  if (trimmed.length > MAX_POST_LENGTH) {
    return { ok: false, error: "Post must be 280 characters or fewer" }
  }
  return { ok: true, value: trimmed }
}

/** Validate a profile bio. Empty bio is allowed (clears the field). */
export function validateBio(bio: string): ValidationResult {
  const trimmed = bio.trim()
  if (trimmed.length > MAX_BIO_LENGTH) {
    return { ok: false, error: "Bio must be 280 characters or fewer" }
  }
  return { ok: true, value: trimmed }
}
