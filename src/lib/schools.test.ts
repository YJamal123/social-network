import { describe, it, expect } from "vitest"
import { SCHOOLS, isValidSchool } from "@/lib/schools"

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
