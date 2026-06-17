import { describe, it, expect } from "vitest"
import {
  INTERESTED_IN,
  LOOKING_FOR,
  sanitizeSelections,
  parseSelections,
} from "@/lib/profileFields"

describe("INTERESTED_IN / LOOKING_FOR", () => {
  it("are the verbatim 2004 option sets", () => {
    expect(INTERESTED_IN).toEqual(["Men", "Women"])
    expect(LOOKING_FOR).toEqual([
      "Friendship",
      "A relationship",
      "Dating",
      "Whatever I can get",
      "Random play",
    ])
  })
})

describe("sanitizeSelections", () => {
  it("keeps whitelisted values in whitelist order", () => {
    expect(sanitizeSelections(["Women", "Men"], INTERESTED_IN)).toBe("Men, Women")
  })

  it("drops anything not on the whitelist", () => {
    expect(sanitizeSelections(["Men", "Aliens"], INTERESTED_IN)).toBe("Men")
  })

  it("dedupes repeated values", () => {
    expect(sanitizeSelections(["Dating", "Dating"], LOOKING_FOR)).toBe("Dating")
  })

  it("accepts a single (non-array) value", () => {
    expect(sanitizeSelections("Men", INTERESTED_IN)).toBe("Men")
  })

  it("returns empty string when nothing valid is selected", () => {
    expect(sanitizeSelections([], INTERESTED_IN)).toBe("")
    expect(sanitizeSelections(["Nope"], INTERESTED_IN)).toBe("")
    expect(sanitizeSelections(null, INTERESTED_IN)).toBe("")
  })

  it("ignores non-string entries", () => {
    expect(sanitizeSelections([123, "Men", null], INTERESTED_IN)).toBe("Men")
  })
})

describe("parseSelections", () => {
  it("splits a stored comma-joined string and trims", () => {
    expect(parseSelections("Men, Women")).toEqual(["Men", "Women"])
  })

  it("returns an empty array for null/empty input", () => {
    expect(parseSelections(null)).toEqual([])
    expect(parseSelections("")).toEqual([])
    expect(parseSelections(undefined)).toEqual([])
  })

  it("is the inverse of sanitizeSelections", () => {
    const stored = sanitizeSelections(["Friendship", "Dating"], LOOKING_FOR)
    expect(parseSelections(stored)).toEqual(["Friendship", "Dating"])
  })
})
