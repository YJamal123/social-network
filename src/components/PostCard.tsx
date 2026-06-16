import Link from "next/link"
import type { PostWithAuthor } from "@/lib/types"
import { timeAgo } from "@/lib/time"

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
