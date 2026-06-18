// Pure builder for the directory's structured-search WHERE clause. No DB, no
// auth, no side effects — just turns a set of optional filters into a
// parameterized SQL fragment + an ordered params array, so getUsers can splice
// it after the viewer-id parameter. Every predicate is parameterized; nothing is
// ever interpolated into SQL. Trivially testable.

import type { DirectoryFilters } from "@/lib/types"

export interface UserSearchClause {
  // SQL boolean expression referencing $startIndex.. placeholders, ANDed onto the
  // base query. Always non-empty (at minimum "true") so callers can append it
  // unconditionally.
  where: string
  // The values for the placeholders, in $startIndex.. order.
  params: (string | number | null)[]
}

/**
 * Build the structured directory search predicate.
 *
 * @param filters    The (already-trimmed) search filters from the query string.
 * @param startIndex The placeholder number to start at (e.g. 2 when $1 is the
 *                   viewer id). Defaults to 2.
 *
 * Each predicate is a no-op when its filter is blank:
 *   q        -> username ILIKE %q%
 *   school   -> exact school match
 *   year     -> exact class_year match (null = no filter)
 *   course   -> courses ILIKE %course%
 *   interest -> interests ILIKE %interest%
 */
export function buildUserSearch(
  filters: DirectoryFilters,
  startIndex = 2
): UserSearchClause {
  const clauses: string[] = []
  const params: (string | number | null)[] = []
  let i = startIndex

  const q = filters.q?.trim() ?? ""
  if (q) {
    clauses.push(`u.username ILIKE $${i}`)
    params.push(`%${q}%`)
    i++
  }

  const school = filters.school?.trim() ?? ""
  if (school) {
    clauses.push(`u.school = $${i}`)
    params.push(school)
    i++
  }

  // year may arrive as a string from searchParams; the caller is expected to
  // pass a parsed number or null. A non-finite value is treated as "no filter".
  const year = filters.year
  if (typeof year === "number" && Number.isFinite(year)) {
    clauses.push(`u.class_year = $${i}`)
    params.push(year)
    i++
  }

  const course = filters.course?.trim() ?? ""
  if (course) {
    clauses.push(`u.courses ILIKE $${i}`)
    params.push(`%${course}%`)
    i++
  }

  const interest = filters.interest?.trim() ?? ""
  if (interest) {
    clauses.push(`u.interests ILIKE $${i}`)
    params.push(`%${interest}%`)
    i++
  }

  return {
    where: clauses.length > 0 ? clauses.join(" AND ") : "true",
    params,
  }
}
