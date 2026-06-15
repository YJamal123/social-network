"use client"

import { useRef, useState, useTransition } from "react"
import { createPost } from "@/app/(main)/feed/actions"

const MAX = 280

export function PostForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [content, setContent] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await createPost(content)
      if (result.error) {
        setError(result.error)
      } else {
        setContent("")
        formRef.current?.reset()
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={MAX}
        rows={3}
        required
        placeholder="What's on your mind?"
        className="w-full resize-none rounded border border-gray-300 bg-white p-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {content.length}/{MAX}
        </span>
        <button
          type="submit"
          disabled={pending || content.trim().length === 0}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  )
}
