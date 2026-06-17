import { describe, it, expect } from "vitest"
import { SCHOOLS, isValidSchool, SCHOOL_META } from "@/lib/schools"

describe("SCHOOLS", () => {
  it("is the eight Ivy League schools in alphabetical order", () => {
    expect(SCHOOLS).toEqual([
      "Brown",
      "Columbia",
      "Cornell",
      "Dartmouth",
      "Harvard",
      "Penn",
      "Princeton",
      "Yale",
    ])
  })
})

describe("isValidSchool", () => {
  it("accepts every whitelisted school", () => {
    for (const school of SCHOOLS) {
      expect(isValidSchool(school)).toBe(true)
    }
  })

  it("rejects a non-whitelisted school", () => {
    expect(isValidSchool("MIT")).toBe(false)
  })

  it("rejects the empty string", () => {
    expect(isValidSchool("")).toBe(false)
  })

  it("is case-sensitive", () => {
    expect(isValidSchool("cornell")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isValidSchool(null)).toBe(false)
    expect(isValidSchool(undefined)).toBe(false)
    expect(isValidSchool(123)).toBe(false)
  })
})

describe("SCHOOL_META", () => {
  it("has an entry for every whitelisted school", () => {
    for (const school of SCHOOLS) {
      expect(SCHOOL_META[school]).toBeDefined()
    }
  })

  it("has exactly the eight school keys (no extras, no missing)", () => {
    expect(Object.keys(SCHOOL_META).sort()).toEqual([...SCHOOLS].sort())
  })

  it("points every banner at a static /banners/ path", () => {
    for (const school of SCHOOLS) {
      expect(SCHOOL_META[school].banner).toMatch(/^\/banners\/[a-z]+\.jpg$/)
    }
  })

  it("gives every school a non-empty wordmark and tagline", () => {
    for (const school of SCHOOLS) {
      expect(SCHOOL_META[school].name.length).toBeGreaterThan(0)
      expect(SCHOOL_META[school].tagline.length).toBeGreaterThan(0)
    }
  })
})
