import Link from "next/link"
import { Avatar } from "@/components/Avatar"
import { timeAgo } from "@/lib/time"

// One inbox row — a single Link to the thread (avoids nesting anchors the way
// wrapping UserRow would). Unread rows get a periwinkle left accent, a bolder
// snippet, and a navy unread chip. The snippet shows a "You: " prefix when the
// viewer sent the last message.
export function MessageRow({
  partnerId,
  username,
  lastContent,
  lastSenderId,
  viewerId,
  createdAt,
  unread,
}: {
  partnerId: string
  username: string
  lastContent: string
  lastSenderId: string
  viewerId: string
  createdAt: string
  unread: number
}) {
  const isUnread = unread > 0
  const snippet =
    lastSenderId === viewerId ? `You: ${lastContent}` : lastContent

  return (
    <Link
      href={`/messages/${username}`}
      className="flex items-center gap-3 border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container"
    >
      {isUnread && (
        <span
          className="h-8 w-1 shrink-0 rounded-full bg-periwinkle"
          aria-hidden
        />
      )}
      <Avatar userId={partnerId} username={username} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-label-bold text-primary">{username}</div>
        <div
          className={`truncate text-body-sm ${
            isUnread ? "font-medium text-on-surface" : "text-on-surface-variant"
          }`}
        >
          {snippet}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-body-sm text-outline">{timeAgo(createdAt)}</span>
        {isUnread && (
          <span
            aria-label={`${unread} unread messages`}
            aria-live="polite"
            className="inline-flex min-w-badge items-center justify-center rounded-full bg-primary px-1 text-body-sm font-bold text-on-primary"
          >
            {unread}
          </span>
        )}
      </div>
    </Link>
  )
}
