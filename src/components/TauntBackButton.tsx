"use client"

import { useState, useTransition } from "react"
import { tauntBack } from "@/app/(main)/taunts/actions"
import { buttonClass } from "@/lib/ui"

export function TauntBackButton({ taunterId }: { taunterId: string }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await tauntBack(taunterId)
      if (result.error) {
        setError(result.error)
      } else {
        setDone(true)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || done}
        className={buttonClass.outline}
      >
        {done ? "Taunted back!" : "Taunt back"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
