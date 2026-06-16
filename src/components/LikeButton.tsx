"use client"

import { useState, useTransition } from "react"
import { toggleLike } from "@/app/(main)/feed/actions"

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: {
  postId: string
  initialLiked: boolean
  initialCount: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    // Optimistic flip; revert if the action reports an error.
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount((c) => c + (nextLiked ? 1 : -1))
    startTransition(async () => {
      const result = await toggleLike(postId)
      if (result.error) {
        setLiked(!nextLiked)
        setCount((c) => c + (nextLiked ? -1 : 1))
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={liked}
      className={`flex shrink-0 items-center gap-1.5 text-body-sm font-bold transition-colors hover:underline disabled:opacity-50 ${
        liked ? "text-coral" : "text-secondary hover:text-coral"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 21s-7.5-4.6-10-9.2C.5 9 1.5 5.5 4.5 4.5 7 3.7 9 5 12 8c3-3 5-4.3 7.5-3.5 3 1 4 4.5 2.5 7.3C19.5 16.4 12 21 12 21z" />
      </svg>
      <span>Like ({count})</span>
    </button>
  )
}
