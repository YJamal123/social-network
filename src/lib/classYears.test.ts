import { describe, it, expect } from "vitest"
import { CLASS_YEARS, isValidClassYear } from "@/lib/classYears"

describe("CLASS_YEARS", () => {
  it("is the contiguous 2003..2010 range in ascending order", () => {
    expect(CLASS_YEARS).toEqual([
      2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
    ])
  })
})

describe("isValidClassYear", () => {
  it("accepts every whitelisted year", () => {
    for (const year of CLASS_YEARS) {
      expect(isValidClassYear(year)).toBe(true)
    }
  })

  it("rejects a year outside the range", () => {
    expect(isValidClassYear(2002)).toBe(false)
    expect(isValidClassYear(2011)).toBe(false)
    expect(isValidClassYear(1999)).toBe(false)
  })

  it("rejects non-integers", () => {
    expect(isValidClassYear(2004.5)).toBe(false)
    expect(isValidClassYear(NaN)).toBe(false)
  })

  it("rejects non-number values", () => {
    expect(isValidClassYear("2004")).toBe(false)
    expect(isValidClassYear(null)).toBe(false)
    expect(isValidClassYear(undefined)).toBe(false)
  })
})
