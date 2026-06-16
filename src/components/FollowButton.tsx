"use client"

import { useState, useTransition } from "react"
import { toggleFollow } from "@/app/(main)/profile/actions"

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
          ? "shrink-0 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          : "shrink-0 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
