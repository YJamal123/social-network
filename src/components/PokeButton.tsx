"use client"

import { useState, useTransition } from "react"
import { poke } from "@/app/(main)/pokes/actions"
import { buttonClass } from "@/lib/ui"

export function PokeButton({ targetUserId }: { targetUserId: string }) {
  const [poked, setPoked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await poke(targetUserId)
      if (result.error) {
        setError(result.error)
      } else {
        setPoked(true)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || poked}
        className={buttonClass.outline}
      >
        {poked ? "Poked!" : "Poke"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
