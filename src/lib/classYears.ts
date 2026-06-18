// Pure class-year whitelist — no DB, no auth, no side effects.
// A profile may declare a graduating class year; this is the canonical range
// used at register and updateProfile, and rendered as "Class of {year}". Stored
// as an INT column. Trivially testable.

export const CLASS_YEARS = [
  2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
] as const

export type ClassYear = (typeof CLASS_YEARS)[number]

/** True if `n` is exactly one of the whitelisted graduating class years. */
export function isValidClassYear(n: unknown): n is ClassYear {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    (CLASS_YEARS as readonly number[]).includes(n)
  )
}
