import Link from "next/link"
import type { PostWithAuthor } from "@/lib/types"
import { timeAgo } from "@/lib/time"
import { Avatar } from "@/components/Avatar"
import { LikeButton } from "@/components/LikeButton"
import { CommentSection } from "@/components/CommentSection"

export function PostCard({ post }: { post: PostWithAuthor }) {
  return (
    <article className="overflow-hidden rounded-lg bg-surface-container-lowest shadow">
      <div className="p-panel-padding">
        <div className="flex gap-stack-lg">
          <Link href={`/profile/${post.username}`} className="shrink-0">
            <Avatar username={post.username} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/profile/${post.username}`}
                className="text-label-bold text-primary hover:underline"
              >
                {post.username}
              </Link>
              <span className="shrink-0 text-body-sm text-on-surface-variant">
                {timeAgo(post.created_at)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-body-base text-on-background">
              {post.content}
            </p>
            <div className="mt-4 flex items-start gap-6 border-t border-outline-variant pt-stack-md">
              <LikeButton
                postId={post.id}
                initialLiked={post.liked_by_me}
                initialCount={post.like_count}
              />
              <CommentSection postId={post.id} initialCount={post.comment_count} />
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
