import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
import { fetchPosts } from "@/lib/queries"
import { PostCard } from "@/components/PostCard"
import { FollowButton } from "@/components/FollowButton"
import { FriendButton } from "@/components/FriendButton"
import { PokeButton } from "@/components/PokeButton"
import { TauntButton } from "@/components/TauntButton"
import { WallComposer } from "@/components/WallComposer"
import { Panel } from "@/components/Panel"
import { Avatar } from "@/components/Avatar"
import { EmptyState } from "@/components/EmptyState"
import { UserNameTime } from "@/components/UserNameTime"
import { getWallPosts } from "@/app/(main)/profile/actions"
import { getFriendshipState, getFriends } from "@/app/(main)/friends/actions"
import { buttonClass } from "@/lib/ui"
import type { PostWithAuthor, ProfileUser } from "@/lib/types"

async function getProfile(
  username: string,
  viewerId: string | null
): Promise<ProfileUser | null> {
  const rows = await getPrisma().$queryRawUnsafe<ProfileUser[]>(
    `SELECT u.id, u.username, u.bio, u.relationship_status, u.interests,
            u.courses, u.school, u.interested_in, u.looking_for, u.class_year,
            u.created_at,
            (SELECT COUNT(*)::int FROM posts p WHERE p.user_id = u.id) AS post_count,
            (SELECT COUNT(*)::int FROM follows f WHERE f.following_id = u.id) AS follower_count,
            (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
            (SELECT COUNT(*)::int FROM friendships fr
              WHERE fr.confirmed = true
                AND (fr.requester_id = u.id OR fr.addressee_id = u.id)) AS friend_count,
            -- Mutual friends: confirmed friends shared by the viewer ($2) and
            -- this profile (u.id). Empty when logged out or viewing own profile.
            (SELECT COUNT(*)::int FROM (
               SELECT CASE WHEN fr.requester_id = u.id
                           THEN fr.addressee_id ELSE fr.requester_id END AS fid
                 FROM friendships fr
                WHERE fr.confirmed = true
                  AND (fr.requester_id = u.id OR fr.addressee_id = u.id)
               INTERSECT
               SELECT CASE WHEN fv.requester_id = $2::uuid
                           THEN fv.addressee_id ELSE fv.requester_id END AS fid
                 FROM friendships fv
                WHERE fv.confirmed = true
                  AND $2::uuid IS NOT NULL AND $2::uuid <> u.id
                  AND (fv.requester_id = $2::uuid OR fv.addressee_id = $2::uuid)
             ) mutual) AS mutual_friend_count
       FROM users u
      WHERE u.username = $1`,
    username,
    viewerId
  )
  return rows[0] ?? null
}

async function getViewerSchool(viewerId: string): Promise<string | null> {
  const row = await getPrisma().user.findUnique({
    where: { id: viewerId },
    select: { school: true },
  })
  return row?.school ?? null
}

// The confirmed partner (if any) for the profile being viewed. One linked
// relationship per pair; the partner is whichever side isn't this user. Newest
// confirmed row wins.
async function getConfirmedPartner(
  userId: string
): Promise<{ username: string; status: string } | null> {
  const rows = await getPrisma().$queryRawUnsafe<
    { username: string; status: string }[]
  >(
    `SELECT u.username, r.status
       FROM relationships r
       JOIN users u
         ON u.id = CASE WHEN r.requester_id = $1::uuid
                        THEN r.addressee_id ELSE r.requester_id END
      WHERE r.confirmed = true
        AND (r.requester_id = $1::uuid OR r.addressee_id = $1::uuid)
      ORDER BY r.created_at DESC
      LIMIT 1`,
    userId
  )
  return rows[0] ?? null
}

async function isFollowing(
  followerId: string,
  targetUserId: string
): Promise<boolean> {
  const row = await getPrisma().follow.findUnique({
    where: {
      followerId_followingId: {
        followerId,
        followingId: targetUserId,
      },
    },
    select: { followerId: true },
  })
  return row !== null
}

async function getUserPosts(
  userId: string,
  viewerId: string | null
): Promise<PostWithAuthor[]> {
  return fetchPosts({
    viewerId,
    where: `p.user_id = $2::uuid`,
    params: [userId],
  })
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-bold text-primary">{n}</div>
      <div className="text-caption uppercase tracking-wide text-outline">{label}</div>
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
  const session = await auth()
  const profile = await getProfile(params.username, session?.user?.id ?? null)
  if (!profile) notFound()

  const isOwnProfile = session?.user?.id === profile.id
  const following =
    session?.user?.id && !isOwnProfile
      ? await isFollowing(session.user.id, profile.id)
      : false
  const viewerSchool =
    session?.user?.id && !isOwnProfile
      ? await getViewerSchool(session.user.id)
      : null
  // Cross-school viewers taunt; same-school (or missing-school) viewers poke.
  const canTaunt = Boolean(
    viewerSchool && profile.school && viewerSchool !== profile.school
  )
  const confirmedPartner = await getConfirmedPartner(profile.id)
  const friendshipState =
    session?.user?.id && !isOwnProfile
      ? await getFriendshipState(session.user.id, profile.id)
      : "none"
  const posts = await getUserPosts(profile.id, session?.user?.id ?? null)
  const wallPosts = await getWallPosts(profile.id)
  const friends = await getFriends(profile.id)

  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
  const hasExtra =
    profile.school ||
    profile.class_year ||
    confirmedPartner ||
    profile.relationship_status ||
    profile.interests ||
    profile.courses ||
    profile.interested_in ||
    profile.looking_for

  return (
    <main className="mx-auto flex max-w-container-max flex-col gap-gutter px-gutter py-stack-lg md:flex-row">
      {/* Left rail */}
      <aside className="flex w-full shrink-0 flex-col gap-stack-lg md:w-52">
        <div className="rounded-lg bg-surface-container-lowest p-panel-padding shadow">
          <div className="mb-2">
            <Avatar userId={profile.id} username={profile.username} size="xl" />
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
              <div className="flex flex-wrap gap-2">
                <FollowButton
                  targetUserId={profile.id}
                  initialFollowing={following}
                />
                <FriendButton
                  targetUserId={profile.id}
                  initialState={friendshipState}
                />
                {canTaunt ? (
                  <TauntButton targetUserId={profile.id} />
                ) : (
                  <PokeButton targetUserId={profile.id} />
                )}
                <Link
                  href={`/messages/${profile.username}`}
                  className={buttonClass.outline}
                >
                  Message
                </Link>
              </div>
              {profile.mutual_friend_count > 0 && (
                <p className="text-body-sm text-secondary">
                  {profile.mutual_friend_count} mutual{" "}
                  {profile.mutual_friend_count === 1 ? "friend" : "friends"}
                </p>
              )}
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
            <Stat n={profile.friend_count} label="friends" />
            <div className="h-8 border-l border-outline-variant" />
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
          bodyClassName="p-4"
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
                {profile.school && (
                  <InfoRow label="School" value={profile.school} />
                )}
                {profile.class_year && (
                  <InfoRow
                    label="Class"
                    value={`Class of ${profile.class_year}`}
                  />
                )}
                {confirmedPartner && (
                  <>
                    <dt className="text-body-sm text-secondary">
                      Relationship
                    </dt>
                    <dd className="col-span-2 break-words text-body-sm text-on-surface">
                      {confirmedPartner.status} with{" "}
                      <Link
                        href={`/profile/${confirmedPartner.username}`}
                        className="text-primary hover:underline"
                      >
                        @{confirmedPartner.username}
                      </Link>
                    </dd>
                  </>
                )}
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
                {profile.interested_in && (
                  <InfoRow label="Interested In" value={profile.interested_in} />
                )}
                {profile.looking_for && (
                  <InfoRow label="Looking For" value={profile.looking_for} />
                )}
              </dl>
            )}
          </div>
        </Panel>

        {/* Friends */}
        <Panel
          title="Friends"
          bodyClassName="p-4"
          action={
            friends.length > 0 ? (
              <Link
                href="/friends"
                className="bracket-link text-action-link text-primary hover:underline"
              >
                see all
              </Link>
            ) : undefined
          }
        >
          {friends.length === 0 ? (
            <EmptyState icon="group" message="No friends yet." />
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {friends.slice(0, 12).map((f) => (
                <Link
                  key={f.user_id}
                  href={`/profile/${f.username}`}
                  className="flex flex-col items-center gap-1 rounded p-2 text-center transition-colors hover:bg-surface-container"
                >
                  <Avatar userId={f.user_id} username={f.username} size="sm" />
                  <span className="w-full truncate text-body-sm text-primary">
                    {f.username}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {/* The Wall */}
        <Panel title="The Wall" bodyClassName="p-4">
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
                  <UserNameTime
                    username={wp.author_username}
                    time={wp.created_at}
                  />
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
