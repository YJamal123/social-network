"use client"

import { useState, useTransition } from "react"
import { pokeBack } from "@/app/(main)/pokes/actions"
import { buttonClass } from "@/lib/ui"

export function PokeBackButton({ pokerId }: { pokerId: string }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await pokeBack(pokerId)
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
        {done ? "Poked back!" : "Poke back"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
