"use client"

import { useState, useTransition } from "react"
import {
  sendFriendRequest,
  confirmFriend,
  removeFriend,
} from "@/app/(main)/friends/actions"
import { buttonClass } from "@/lib/ui"
import type { FriendshipState } from "@/lib/types"

// The friend action on a profile. Label + action depend on the current state:
//   none        -> "Add Friend"  (send request)
//   pending_out -> "Requested"   (cancel request)
//   pending_in  -> "Confirm"     (confirm the incoming request)
//   friends     -> "Friends ✓"   (remove friend)
export function FriendButton({
  targetUserId,
  initialState,
}: {
  targetUserId: string
  initialState: FriendshipState
}) {
  const [state, setState] = useState<FriendshipState>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(
    action: () => Promise<{ error?: string }>,
    nextState: FriendshipState
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
      } else {
        setState(nextState)
      }
    })
  }

  function handleClick() {
    switch (state) {
      case "none":
        run(() => sendFriendRequest(targetUserId), "pending_out")
        break
      case "pending_out":
        run(() => removeFriend(targetUserId), "none")
        break
      case "pending_in":
        run(() => confirmFriend(targetUserId), "friends")
        break
      case "friends":
        run(() => removeFriend(targetUserId), "none")
        break
    }
  }

  const label = {
    none: "Add Friend",
    pending_out: "Requested",
    pending_in: "Confirm",
    friends: "Friends ✓",
  }[state]

  // Confirm is the high-emphasis action; the rest are bordered.
  const className =
    state === "pending_in" ? buttonClass.primary : buttonClass.outline

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
      >
        {label}
      </button>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
