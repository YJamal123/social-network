"use client"

import { useState, useTransition } from "react"
import { pokeBack } from "@/app/(main)/pokes/actions"
import { buttonClass } from "@/lib/ui"

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
      className={buttonClass.outline}
    >
      {done ? "Poked back!" : "Poke back"}
    </button>
  )
}
