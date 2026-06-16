"use client"

import { useState, useTransition } from "react"
import { addComment, getComments } from "@/app/(main)/feed/actions"
import type { CommentWithAuthor } from "@/lib/types"
import { timeAgo } from "@/lib/time"

const MAX_COMMENT_LENGTH = 280

export function CommentSection({
  postId,
  initialCount,
}: {
  postId: string
  initialCount: number
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<CommentWithAuthor[]>([])
  const [count, setCount] = useState(initialCount)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function loadComments() {
    setLoading(true)
    const result = await getComments(postId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setComments(result.comments ?? [])
    setCount(result.comments?.length ?? 0)
    setLoaded(true)
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    // Lazily load comments the first time the thread is expanded.
    if (next && !loaded) {
      void loadComments()
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const content = draft.trim()
    if (!content) return
    startTransition(async () => {
      const result = await addComment(postId, content)
      if (result.error) {
        setError(result.error)
        return
      }
      setError(null)
      setDraft("")
      await loadComments()
    })
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex items-center gap-1 text-gray-500 hover:text-blue-600"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
        <span>{count}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && <p className="text-gray-400">Loading comments…</p>}

          {loaded && comments.length === 0 && !loading && (
            <p className="text-gray-400">No comments yet.</p>
          )}

          {comments.map((comment) => (
            <div key={comment.id} className="rounded-md bg-gray-50 p-2">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="font-medium">{comment.username}</span>
                <span className="text-xs text-gray-400">
                  · {timeAgo(comment.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-gray-800">
                {comment.content}
              </p>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_COMMENT_LENGTH}
              rows={2}
              placeholder="Write a comment…"
              className="w-full resize-none rounded-md border border-gray-200 p-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="text-red-600">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {draft.length}/{MAX_COMMENT_LENGTH}
              </span>
              <button
                type="submit"
                disabled={pending || draft.trim().length === 0}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Posting…" : "Comment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
