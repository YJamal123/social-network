import { describe, it, expect } from "vitest"
import {
  RELATIONSHIP_STATUSES,
  isValidRelationshipStatus,
} from "@/lib/relationships"

describe("RELATIONSHIP_STATUSES", () => {
  it("is the four canonical linked-relationship statuses", () => {
    expect(RELATIONSHIP_STATUSES).toEqual([
      "In a relationship",
      "It's complicated",
      "Married",
      "In an open relationship",
    ])
  })
})

describe("isValidRelationshipStatus", () => {
  it("accepts every whitelisted status", () => {
    for (const status of RELATIONSHIP_STATUSES) {
      expect(isValidRelationshipStatus(status)).toBe(true)
    }
  })

  it("rejects a non-whitelisted status", () => {
    expect(isValidRelationshipStatus("Single")).toBe(false)
  })

  it("rejects the empty string", () => {
    expect(isValidRelationshipStatus("")).toBe(false)
  })

  it("is case-sensitive", () => {
    expect(isValidRelationshipStatus("married")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isValidRelationshipStatus(null)).toBe(false)
    expect(isValidRelationshipStatus(undefined)).toBe(false)
    expect(isValidRelationshipStatus(123)).toBe(false)
  })
})
