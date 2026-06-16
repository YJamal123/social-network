import Link from "next/link"
import type { PostWithAuthor } from "@/lib/types"
import { Avatar } from "@/components/Avatar"
import { UserNameTime } from "@/components/UserNameTime"
import { LikeButton } from "@/components/LikeButton"
import { CommentSection } from "@/components/CommentSection"

export function PostCard({ post }: { post: PostWithAuthor }) {
  return (
    <article className="overflow-hidden rounded-lg bg-surface-container-lowest shadow">
      <div className="p-4">
        <div className="flex gap-stack-lg">
          <Link href={`/profile/${post.username}`} className="shrink-0">
            <Avatar userId={post.user_id} username={post.username} size="md" />
          </Link>
          <div className="min-w-0 flex-1">
            <UserNameTime username={post.username} time={post.created_at} />
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
