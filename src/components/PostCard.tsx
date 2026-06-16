import Link from "next/link"
import type { PostWithAuthor } from "@/lib/types"

function timeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString()
}

export function PostCard({ post }: { post: PostWithAuthor }) {
  const initial = post.username.charAt(0).toUpperCase()

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Link
          href={`/profile/${post.username}`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
        >
          {initial}
        </Link>
        <Link href={`/profile/${post.username}`} className="font-medium hover:underline">
          {post.username}
        </Link>
        <span className="text-xs text-gray-400">· {timeAgo(post.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-gray-800">{post.content}</p>
    </article>
  )
}
