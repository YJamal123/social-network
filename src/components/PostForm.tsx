"use client"

import { useRef, useState, useTransition } from "react"
import { createPost } from "@/app/(main)/feed/actions"
import { Panel } from "@/components/Panel"

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
    <Panel title="What's on your mind?">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-stack-md">
        <textarea
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX}
          rows={3}
          required
          placeholder="Type your status here…"
          className="w-full resize-none rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
        />

        {error && <p className="text-body-sm text-error">{error}</p>}

        <div className="flex items-center justify-between">
          <span
            className={`text-body-sm ${content.length > MAX - 20 ? "text-error" : "text-outline"}`}
          >
            {content.length} / {MAX}
          </span>
          <button
            type="submit"
            disabled={pending || content.trim().length === 0}
            className="rounded bg-primary px-6 py-1.5 text-label-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Posting…" : "Post"}
          </button>
        </div>
      </form>
    </Panel>
  )
}
