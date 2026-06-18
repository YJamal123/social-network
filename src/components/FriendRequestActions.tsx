"use client"

import { useState, useTransition } from "react"
import { confirmFriend, declineFriend } from "@/app/(main)/friends/actions"
import { buttonClass } from "@/lib/ui"

// Confirm / Decline pair for an incoming friend request on the /friends page.
export function FriendRequestActions({ requesterId }: { requesterId: string }) {
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string }>, label: "confirmed" | "declined") {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
      } else {
        setDone(label)
      }
    })
  }

  if (done) {
    return (
      <span className="text-body-sm text-outline">
        {done === "confirmed" ? "Confirmed!" : "Declined"}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run(() => confirmFriend(requesterId), "confirmed")}
          disabled={pending}
          className={buttonClass.primary}
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => run(() => declineFriend(requesterId), "declined")}
          disabled={pending}
          className={buttonClass.outline}
        >
          Decline
        </button>
      </div>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
