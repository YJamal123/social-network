// Pure time-formatting helper used by PostCard and profile views.
// Framework-free so it can be unit-tested without rendering React.

/** Render a timestamp as a short relative label: "just now", "5m", "3h", "2d", or a date. */
export function timeAgo(value: string | Date, now: number = Date.now()): string {
  const date = typeof value === "string" ? new Date(value) : value
  const seconds = Math.floor((now - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString()
}
