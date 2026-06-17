"use client"

import { useState, useTransition } from "react"
import { taunt } from "@/app/(main)/taunts/actions"
import { buttonClass } from "@/lib/ui"

export function TauntButton({ targetUserId }: { targetUserId: string }) {
  const [taunted, setTaunted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await taunt(targetUserId)
      if (result.error) {
        setError(result.error)
      } else {
        setTaunted(true)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || taunted}
        className={buttonClass.outline}
      >
        {taunted ? "Taunted!" : "Taunt!"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
