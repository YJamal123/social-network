"use client"

import { useState, useTransition } from "react"
import { poke } from "@/app/(main)/pokes/actions"

export function PokeButton({ targetUserId }: { targetUserId: string }) {
  const [poked, setPoked] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await poke(targetUserId)
      if (!result.error) {
        setPoked(true)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || poked}
      className="shrink-0 rounded border border-primary px-3 py-1 text-label-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-50"
    >
      {poked ? "Poked!" : "Poke"}
    </button>
  )
}
