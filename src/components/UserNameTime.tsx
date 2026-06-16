import Link from "next/link"
import { timeAgo } from "@/lib/time"

export function UserNameTime({
  username,
  time,
  className,
}: {
  username: string
  time: string | Date
  className?: string
}) {
  return (
    <div
      className={`flex items-start justify-between gap-2${className ? ` ${className}` : ""}`}
    >
      <Link
        href={`/profile/${username}`}
        className="text-label-bold text-primary hover:underline"
      >
        {username}
      </Link>
      <span className="shrink-0 text-body-sm text-on-surface-variant">
        {timeAgo(time)}
      </span>
    </div>
  )
}
