import { describe, it, expect } from "vitest"
import { timeAgo } from "@/lib/time"

// Fixed reference point so tests are deterministic (no real clock).
const NOW = new Date("2026-06-16T12:00:00Z").getTime()
const ago = (ms: number) => new Date(NOW - ms)

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("timeAgo", () => {
  it("shows 'just now' under a minute", () => {
    expect(timeAgo(ago(30 * SECOND), NOW)).toBe("just now")
  })

  it("shows minutes under an hour", () => {
    expect(timeAgo(ago(5 * MINUTE), NOW)).toBe("5m")
  })

  it("shows hours under a day", () => {
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe("3h")
  })

  it("shows days under a week", () => {
    expect(timeAgo(ago(2 * DAY), NOW)).toBe("2d")
  })

  it("falls back to a date string at a week or more", () => {
    const result = timeAgo(ago(8 * DAY), NOW)
    expect(result).not.toMatch(/^(just now|\d+[mhd])$/)
  })

  it("accepts ISO strings as well as Date objects", () => {
    expect(timeAgo(ago(5 * MINUTE).toISOString(), NOW)).toBe("5m")
  })
})
