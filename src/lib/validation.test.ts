import { describe, it, expect } from "vitest"
import { validatePostContent, validateBio, validateComment, validateMessage, MAX_POST_LENGTH, MAX_COMMENT_LENGTH, MAX_MESSAGE_LENGTH } from "@/lib/validation"

describe("validatePostContent", () => {
  it("accepts normal content and returns the trimmed value", () => {
    const result = validatePostContent("  hello world  ")
    expect(result).toEqual({ ok: true, value: "hello world" })
  })

  it("rejects empty content", () => {
    expect(validatePostContent("")).toMatchObject({ ok: false })
  })

  it("rejects whitespace-only content", () => {
    expect(validatePostContent("    ")).toMatchObject({ ok: false })
  })

  it("accepts content exactly at the max length", () => {
    const atLimit = "a".repeat(MAX_POST_LENGTH)
    expect(validatePostContent(atLimit)).toEqual({ ok: true, value: atLimit })
  })

  it("rejects content over the max length", () => {
    const tooLong = "a".repeat(MAX_POST_LENGTH + 1)
    expect(validatePostContent(tooLong)).toMatchObject({ ok: false })
  })
})

describe("validateBio", () => {
  it("allows an empty bio (clearing the field)", () => {
    expect(validateBio("")).toEqual({ ok: true, value: "" })
  })

  it("rejects a bio over the max length", () => {
    expect(validateBio("a".repeat(281))).toMatchObject({ ok: false })
  })
})

describe("validateComment", () => {
  it("accepts normal content and returns the trimmed value", () => {
    const result = validateComment("  nice post  ")
    expect(result).toEqual({ ok: true, value: "nice post" })
  })

  it("rejects empty content", () => {
    expect(validateComment("")).toMatchObject({ ok: false })
  })

  it("rejects whitespace-only content", () => {
    expect(validateComment("   ")).toMatchObject({ ok: false })
  })

  it("accepts content exactly at the max length", () => {
    const atLimit = "a".repeat(MAX_COMMENT_LENGTH)
    expect(validateComment(atLimit)).toEqual({ ok: true, value: atLimit })
  })

  it("rejects content over the max length", () => {
    const tooLong = "a".repeat(MAX_COMMENT_LENGTH + 1)
    expect(validateComment(tooLong)).toMatchObject({ ok: false })
  })
})

describe("validateMessage", () => {
  it("accepts normal content and returns the trimmed value", () => {
    const result = validateMessage("  hey there  ")
    expect(result).toEqual({ ok: true, value: "hey there" })
  })

  it("rejects empty content", () => {
    expect(validateMessage("")).toMatchObject({ ok: false })
  })

  it("rejects whitespace-only content", () => {
    expect(validateMessage("   ")).toMatchObject({ ok: false })
  })

  it("accepts content exactly at the max length", () => {
    const atLimit = "a".repeat(MAX_MESSAGE_LENGTH)
    expect(validateMessage(atLimit)).toEqual({ ok: true, value: atLimit })
  })

  it("rejects content over the max length", () => {
    const tooLong = "a".repeat(MAX_MESSAGE_LENGTH + 1)
    expect(validateMessage(tooLong)).toMatchObject({ ok: false })
  })
})
