import { describe, it, expect } from "vitest"
import { buildUserSearch } from "@/lib/directory"
import type { DirectoryFilters } from "@/lib/types"

const empty: DirectoryFilters = {
  q: "",
  school: "",
  year: null,
  course: "",
  interest: "",
}

describe("buildUserSearch", () => {
  it("returns 'true' and no params when all filters are blank", () => {
    const { where, params } = buildUserSearch(empty)
    expect(where).toBe("true")
    expect(params).toEqual([])
  })

  it("builds a username ILIKE predicate starting at $2 by default", () => {
    const { where, params } = buildUserSearch({ ...empty, q: "tom" })
    expect(where).toBe("u.username ILIKE $2")
    expect(params).toEqual(["%tom%"])
  })

  it("respects a custom start index", () => {
    const { where, params } = buildUserSearch({ ...empty, q: "tom" }, 5)
    expect(where).toBe("u.username ILIKE $5")
    expect(params).toEqual(["%tom%"])
  })

  it("matches school exactly (no wildcards)", () => {
    const { where, params } = buildUserSearch({ ...empty, school: "Cornell" })
    expect(where).toBe("u.school = $2")
    expect(params).toEqual(["Cornell"])
  })

  it("matches class_year exactly with the numeric value", () => {
    const { where, params } = buildUserSearch({ ...empty, year: 2006 })
    expect(where).toBe("u.class_year = $2")
    expect(params).toEqual([2006])
  })

  it("ignores a null/non-finite year", () => {
    expect(buildUserSearch({ ...empty, year: null }).where).toBe("true")
    expect(buildUserSearch({ ...empty, year: NaN }).params).toEqual([])
  })

  it("wraps course and interest in ILIKE wildcards", () => {
    const course = buildUserSearch({ ...empty, course: "CS161" })
    expect(course.where).toBe("u.courses ILIKE $2")
    expect(course.params).toEqual(["%CS161%"])

    const interest = buildUserSearch({ ...empty, interest: "skating" })
    expect(interest.where).toBe("u.interests ILIKE $2")
    expect(interest.params).toEqual(["%skating%"])
  })

  it("ANDs all predicates with sequential placeholders in field order", () => {
    const { where, params } = buildUserSearch({
      q: "a",
      school: "Yale",
      year: 2005,
      course: "Art",
      interest: "ramen",
    })
    expect(where).toBe(
      "u.username ILIKE $2 AND u.school = $3 AND u.class_year = $4 AND u.courses ILIKE $5 AND u.interests ILIKE $6"
    )
    expect(params).toEqual(["%a%", "Yale", 2005, "%Art%", "%ramen%"])
  })

  it("trims whitespace and treats whitespace-only text filters as blank", () => {
    expect(buildUserSearch({ ...empty, q: "   " }).where).toBe("true")
    const trimmed = buildUserSearch({ ...empty, school: "  Brown  " })
    expect(trimmed.params).toEqual(["Brown"])
  })

  it("skips blank filters and only numbers the present ones", () => {
    const { where, params } = buildUserSearch({
      ...empty,
      school: "Penn",
      interest: "soccer",
    })
    expect(where).toBe("u.school = $2 AND u.interests ILIKE $3")
    expect(params).toEqual(["Penn", "%soccer%"])
  })
})
