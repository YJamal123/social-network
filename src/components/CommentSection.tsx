"use client"

import { useState, useTransition } from "react"
import { addComment, getComments } from "@/app/(main)/feed/actions"
import type { CommentWithAuthor } from "@/lib/types"
import { timeAgo } from "@/lib/time"
import { buttonClass } from "@/lib/ui"

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
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-body-sm font-bold text-secondary transition-colors hover:text-primary hover:underline"
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
        <span>Comment ({count})</span>
      </button>

      {open && (
        <div className="mt-stack-md space-y-stack-md rounded border border-outline-variant bg-surface-container p-panel-padding">
          {loading && <p className="text-body-sm text-outline">Loading comments…</p>}

          {loaded && comments.length === 0 && !loading && (
            <p className="text-body-sm text-outline">No comments yet.</p>
          )}

          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded border border-outline-variant bg-white p-2"
            >
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="text-label-bold text-primary">{comment.username}</span>
                <span className="text-body-sm text-outline">
                  {timeAgo(comment.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface">
                {comment.content}
              </p>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="space-y-stack-sm">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_COMMENT_LENGTH}
              rows={2}
              placeholder="Write a comment…"
              className="w-full resize-none rounded border border-outline-variant bg-white p-2 text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
            />
            {error && <p className="text-body-sm text-error">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-outline">
                {draft.length}/{MAX_COMMENT_LENGTH}
              </span>
              <button
                type="submit"
                disabled={pending || draft.trim().length === 0}
                className={buttonClass.primary}
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
