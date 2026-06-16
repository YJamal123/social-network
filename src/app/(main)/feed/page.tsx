import { query } from "@/lib/db"
import { auth } from "@/lib/auth"
import { PostForm } from "@/components/PostForm"
import { PostCard } from "@/components/PostCard"
import type { PostWithAuthor } from "@/lib/types"

async function getPosts(userId: string): Promise<PostWithAuthor[]> {
  // Posts from followed users + self, newest first. Fallback: if the user
  // follows nobody, show ALL posts so a new user's feed isn't empty.
  const result = await query<PostWithAuthor>(
    `WITH my_follows AS (
       SELECT following_id FROM follows WHERE follower_id = $1
     )
     SELECT p.id, p.user_id, p.content, p.created_at, u.username
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE NOT EXISTS (SELECT 1 FROM my_follows)
         OR p.user_id = $1
         OR p.user_id IN (SELECT following_id FROM my_follows)
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [userId]
  )
  return result.rows
}

export default async function FeedPage() {
  const session = await auth()
  const posts = session?.user?.id ? await getPosts(session.user.id) : []

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Feed</h1>

      <PostForm />

      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            No posts yet. Be the first to say something.
          </p>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </main>
  )
}
