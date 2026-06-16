import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { PostCard } from "@/components/PostCard"
import type { PostWithAuthor, ProfileUser } from "@/lib/types"

async function getProfile(username: string): Promise<ProfileUser | null> {
  const result = await query<ProfileUser>(
    `SELECT u.id, u.username, u.bio, u.created_at,
            COUNT(p.id)::int AS post_count
       FROM users u
       LEFT JOIN posts p ON p.user_id = u.id
      WHERE u.username = $1
      GROUP BY u.id`,
    [username]
  )
  return result.rows[0] ?? null
}

async function getUserPosts(userId: string): Promise<PostWithAuthor[]> {
  const result = await query<PostWithAuthor>(
    `SELECT p.id, p.user_id, p.content, p.created_at, u.username
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [userId]
  )
  return result.rows
}

export default async function ProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const profile = await getProfile(params.username)
  if (!profile) notFound()

  const session = await auth()
  const isOwnProfile = session?.user?.id === profile.id
  const posts = await getUserPosts(profile.id)

  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })

  return (
    <main className="mx-auto max-w-2xl p-6">
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-semibold text-white">
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h1 className="truncate text-2xl font-bold">{profile.username}</h1>
              {isOwnProfile && (
                <Link
                  href={`/profile/${profile.username}/edit`}
                  className="shrink-0 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit profile
                </Link>
              )}
            </div>
            {profile.bio ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-gray-700">
                {profile.bio}
              </p>
            ) : (
              <p className="mt-1 text-sm italic text-gray-400">No bio yet.</p>
            )}
            <p className="mt-3 text-sm text-gray-500">
              {profile.post_count} {profile.post_count === 1 ? "post" : "posts"} ·
              Joined {joined}
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="py-8 text-center text-gray-400">No posts yet.</p>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </main>
  )
}
