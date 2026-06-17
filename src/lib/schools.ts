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

/**
 * Per-school presentation metadata for the campus banner.
 *
 * `banner` is a FULL STATIC path under `public/` (served from the site root) —
 * these are plain `src` strings, never interpolated into a className, so JIT
 * purge is irrelevant. `name` is the full institutional wordmark and `tagline`
 * is the small location/est. line shown under it. Keyed by the exact `School`
 * union so TypeScript guarantees all eight entries exist (no missing-key path).
 * Images live in `public/banners/` (see that dir's manifest.json for provenance).
 */
export interface SchoolMeta {
  name: string
  tagline: string
  banner: string
}

export const SCHOOL_META: Record<School, SchoolMeta> = {
  Brown: {
    name: "BROWN UNIVERSITY",
    tagline: "Providence, RI · Class network · Est. 1764",
    banner: "/banners/brown.jpg",
  },
  Columbia: {
    name: "COLUMBIA UNIVERSITY",
    tagline: "New York, NY · Class network · Est. 1754",
    banner: "/banners/columbia.jpg",
  },
  Cornell: {
    name: "CORNELL UNIVERSITY",
    tagline: "Ithaca, NY · Class network · Est. 1865",
    banner: "/banners/cornell.jpg",
  },
  Dartmouth: {
    name: "DARTMOUTH COLLEGE",
    tagline: "Hanover, NH · Class network · Est. 1769",
    banner: "/banners/dartmouth.jpg",
  },
  Harvard: {
    name: "HARVARD UNIVERSITY",
    tagline: "Cambridge, MA · Class network · Est. 1636",
    banner: "/banners/harvard.jpg",
  },
  Penn: {
    name: "UNIVERSITY OF PENNSYLVANIA",
    tagline: "Philadelphia, PA · Class network · Est. 1740",
    banner: "/banners/penn.jpg",
  },
  Princeton: {
    name: "PRINCETON UNIVERSITY",
    tagline: "Princeton, NJ · Class network · Est. 1746",
    banner: "/banners/princeton.jpg",
  },
  Yale: {
    name: "YALE UNIVERSITY",
    tagline: "New Haven, CT · Class network · Est. 1701",
    banner: "/banners/yale.jpg",
  },
}
