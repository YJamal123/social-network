import Link from "next/link"
import type { ReactNode } from "react"
import { Avatar } from "@/components/Avatar"

export function UserRow({
  userId,
  username,
  subtitle,
  action,
}: {
  userId: string
  username: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <Link href={`/profile/${username}`} className="shrink-0">
        <Avatar userId={userId} username={username} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${username}`}
          className="block truncate text-label-bold text-primary hover:underline"
        >
          {username}
        </Link>
        {subtitle != null && (
          <div className="truncate text-body-sm">{subtitle}</div>
        )}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  )
}
