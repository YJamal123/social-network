"use client"

import { useRef, useState, useTransition } from "react"
import { postToWall } from "@/app/(main)/profile/actions"
import { buttonClass, fieldClass } from "@/lib/ui"

const MAX = 280

export function WallComposer({ ownerId }: { ownerId: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [content, setContent] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await postToWall(ownerId, content)
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
      className="mb-4 rounded bg-surface-container-low p-2"
    >
      <textarea
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={MAX}
        rows={3}
        required
        placeholder="Write something…"
        className={`${fieldClass} min-h-composer resize-none`}
      />

      {error && <p className="mt-1 text-body-sm text-error">{error}</p>}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-body-sm text-outline">
          {content.length}/{MAX}
        </span>
        <button
          type="submit"
          disabled={pending || content.trim().length === 0}
          className={buttonClass.primary}
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  )
}
