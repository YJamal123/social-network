"use client"

import { useState, useTransition } from "react"
import { pokeBack } from "@/app/(main)/pokes/actions"

export function PokeBackButton({ pokerId }: { pokerId: string }) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await pokeBack(pokerId)
      if (!result.error) {
        setDone(true)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || done}
      className="shrink-0 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {done ? "Poked back!" : "Poke back"}
    </button>
  )
}
