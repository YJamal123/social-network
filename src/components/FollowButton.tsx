"use client"

import { useState, useTransition } from "react"
import { toggleFollow } from "@/app/(main)/profile/actions"
import { buttonClass } from "@/lib/ui"

export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    // Optimistic flip; revert if the action reports an error.
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      const result = await toggleFollow(targetUserId)
      if (result.error) {
        setFollowing(!next)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        following
          ? buttonClass.outline
          : "shrink-0 rounded bg-primary px-3 py-1 text-label-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
