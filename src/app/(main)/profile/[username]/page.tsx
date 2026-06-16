import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { PostCard } from "@/components/PostCard"
import { FollowButton } from "@/components/FollowButton"
import type { PostWithAuthor, ProfileUser } from "@/lib/types"

async function getProfile(username: string): Promise<ProfileUser | null> {
  const result = await query<ProfileUser>(
    `SELECT u.id, u.username, u.bio, u.created_at,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id) AS post_count,
            (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS follower_count,
            (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count
       FROM users u
      WHERE u.username = $1`,
    [username]
  )
  return result.rows[0] ?? null
}

async function isFollowing(
  followerId: string,
  targetUserId: string
): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
    [followerId, targetUserId]
  )
  return Boolean(result.rowCount && result.rowCount > 0)
}

async function getUserPosts(
  userId: string,
  viewerId: string | null
): Promise<PostWithAuthor[]> {
  const result = await query<PostWithAuthor>(
    `SELECT p.id, p.user_id, p.content, p.created_at, u.username,
            (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
            EXISTS (
              SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $2
            ) AS liked_by_me
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [userId, viewerId]
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
  const following =
    session?.user?.id && !isOwnProfile
      ? await isFollowing(session.user.id, profile.id)
      : false
  const posts = await getUserPosts(profile.id, session?.user?.id ?? null)

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
              {isOwnProfile ? (
                <Link
                  href={`/profile/${profile.username}/edit`}
                  className="shrink-0 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit profile
                </Link>
              ) : (
                session?.user?.id && (
                  <FollowButton
                    targetUserId={profile.id}
                    initialFollowing={following}
                  />
                )
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
              <span className="font-semibold text-gray-700">
                {profile.follower_count}
              </span>{" "}
              {profile.follower_count === 1 ? "follower" : "followers"} ·{" "}
              <span className="font-semibold text-gray-700">
                {profile.following_count}
              </span>{" "}
              following
            </p>
            <p className="mt-1 text-sm text-gray-500">
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
