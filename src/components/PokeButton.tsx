"use client"

import { useState, useTransition } from "react"
import { poke } from "@/app/(main)/pokes/actions"
import { buttonClass } from "@/lib/ui"

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
      className={buttonClass.outline}
    >
      {poked ? "Poked!" : "Poke"}
    </button>
  )
}
