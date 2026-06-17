"use client"

import { useState, useTransition } from "react"
import { confirmRelationship } from "@/app/(main)/profile/actions"
import { buttonClass } from "@/lib/ui"

export function RelationshipConfirmButton({
  requesterId,
}: {
  requesterId: string
}) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await confirmRelationship(requesterId)
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
        className={buttonClass.primary}
      >
        {done ? "Confirmed!" : "Confirm"}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
