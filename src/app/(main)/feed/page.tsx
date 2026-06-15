import { auth, signOut } from "@/lib/auth"
import { query } from "@/lib/db"
import { PostForm } from "@/components/PostForm"
import { PostCard } from "@/components/PostCard"
import type { PostWithAuthor } from "@/lib/types"

async function getPosts(): Promise<PostWithAuthor[]> {
  const result = await query<PostWithAuthor>(
    `SELECT p.id, p.user_id, p.content, p.created_at, u.username
       FROM posts p
       JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 50`
  )
  return result.rows
}

export default async function FeedPage() {
  const session = await auth()
  const posts = await getPosts()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feed</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{session?.user?.name}</span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button className="hover:underline">Sign out</button>
          </form>
        </div>
      </div>

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
