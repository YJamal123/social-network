import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { PostCard } from "@/components/PostCard"
import { FollowButton } from "@/components/FollowButton"
import { PokeButton } from "@/components/PokeButton"
import { WallComposer } from "@/components/WallComposer"
import { Panel } from "@/components/Panel"
import { Avatar } from "@/components/Avatar"
import { EmptyState } from "@/components/EmptyState"
import { getWallPosts } from "@/app/(main)/profile/actions"
import { timeAgo } from "@/lib/time"
import type { PostWithAuthor, ProfileUser } from "@/lib/types"

async function getProfile(username: string): Promise<ProfileUser | null> {
  const result = await query<ProfileUser>(
    `SELECT u.id, u.username, u.bio, u.relationship_status, u.interests,
            u.courses, u.created_at,
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
            ) AS liked_by_me,
            (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [userId, viewerId]
  )
  return result.rows
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-bold text-primary">{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-outline">{label}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-body-sm text-secondary">{label}</dt>
      <dd className="col-span-2 whitespace-pre-wrap break-words text-body-sm text-on-surface">
        {value}
      </dd>
    </>
  )
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
  const wallPosts = await getWallPosts(profile.id)

  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
  const hasExtra =
    profile.relationship_status || profile.interests || profile.courses

  return (
    <main className="mx-auto flex max-w-container-max flex-col gap-gutter px-gutter py-stack-lg md:flex-row">
      {/* Left rail */}
      <aside className="flex w-full shrink-0 flex-col gap-stack-lg md:w-52">
        <div className="rounded-lg bg-surface-container-lowest p-panel-padding shadow">
          <div className="mb-2">
            <Avatar username={profile.username} size="xl" />
          </div>
          {isOwnProfile && (
            <div className="text-center">
              <Link
                href={`/profile/${profile.username}/edit`}
                className="bracket-link text-action-link text-primary hover:underline"
              >
                edit
              </Link>
            </div>
          )}
        </div>

        {!isOwnProfile && session?.user?.id && (
          <Panel title="Connection">
            <div className="flex flex-col gap-2">
              {following && (
                <div className="flex items-center gap-1 text-body-sm text-on-surface">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  Following
                </div>
              )}
              <div className="flex gap-2">
                <FollowButton
                  targetUserId={profile.id}
                  initialFollowing={following}
                />
                <PokeButton targetUserId={profile.id} />
              </div>
            </div>
          </Panel>
        )}
      </aside>

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col gap-stack-lg">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 rounded-lg bg-surface-container-lowest p-4 shadow sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className="truncate text-title-lg text-primary">
              {profile.username}
            </h1>
            <div className="text-body-sm text-secondary">Joined {joined}</div>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-center">
            <Stat n={profile.follower_count} label="followers" />
            <div className="h-8 border-l border-outline-variant" />
            <Stat n={profile.following_count} label="following" />
            <div className="h-8 border-l border-outline-variant" />
            <Stat n={profile.post_count} label="posts" />
          </div>
        </div>

        {/* Information */}
        <Panel
          title="Information"
          action={
            isOwnProfile && (
              <Link
                href={`/profile/${profile.username}/edit`}
                className="bracket-link text-action-link text-primary hover:underline"
              >
                edit
              </Link>
            )
          }
        >
          <div className="flex flex-col gap-3">
            {profile.bio ? (
              <p className="whitespace-pre-wrap break-words text-body-base text-on-surface">
                {profile.bio}
              </p>
            ) : (
              <p className="text-body-sm italic text-outline">No bio yet.</p>
            )}
            {hasExtra && (
              <dl className="grid grid-cols-3 gap-2">
                {profile.relationship_status && (
                  <InfoRow
                    label="Relationship Status"
                    value={profile.relationship_status}
                  />
                )}
                {profile.interests && (
                  <InfoRow label="Interests" value={profile.interests} />
                )}
                {profile.courses && (
                  <InfoRow label="Courses" value={profile.courses} />
                )}
              </dl>
            )}
          </div>
        </Panel>

        {/* The Wall */}
        <Panel title="The Wall">
          {session?.user?.id && <WallComposer ownerId={profile.id} />}
          {wallPosts.length === 0 ? (
            <EmptyState icon="sticky_note_2" message="Nothing on the wall yet." />
          ) : (
            <div className="flex flex-col gap-4">
              {wallPosts.map((wp) => (
                <div
                  key={wp.id}
                  className="border-b border-outline-variant pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/profile/${wp.author_username}`}
                      className="text-body-sm font-bold text-primary hover:underline"
                    >
                      {wp.author_username}
                    </Link>
                    <span className="shrink-0 text-[10px] text-on-surface-variant">
                      {timeAgo(wp.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-body-base text-on-surface">
                    {wp.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Posts */}
        <section className="flex flex-col gap-stack-md">
          <h2 className="border-b border-outline-variant pb-1 text-section-header text-primary">
            {profile.username}&apos;s posts
          </h2>
          {posts.length === 0 ? (
            <EmptyState icon="article" message="No posts yet." />
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </section>
      </div>
    </main>
  )
}
