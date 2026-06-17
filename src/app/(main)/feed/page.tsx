import Link from "next/link"
import { fetchPosts, fetchRecentUsers, fetchUserSchool } from "@/lib/queries"
import { isValidSchool, SCHOOL_META, type School } from "@/lib/schools"
import { auth } from "@/lib/auth"
import { getUnacknowledgedPokeCount } from "@/app/(main)/pokes/actions"
import { PostForm } from "@/components/PostForm"
import { PostCard } from "@/components/PostCard"
import { Panel } from "@/components/Panel"
import { EmptyState } from "@/components/EmptyState"
import { SchoolBanner } from "@/components/SchoolBanner"
import { AccordionSection } from "@/components/AccordionSection"
import { AdBox } from "@/components/AdBox"
import { Avatar } from "@/components/Avatar"
import { UserRow } from "@/components/UserRow"
import { buttonClass } from "@/lib/ui"
import type { PostWithAuthor } from "@/lib/types"

async function getPosts(userId: string): Promise<PostWithAuthor[]> {
  // Posts from followed users + self, newest first. Fallback: if the user
  // follows nobody, show ALL posts so a new user's feed isn't empty.
  return fetchPosts({
    viewerId: userId,
    cte: `WITH my_follows AS (
            SELECT following_id FROM follows WHERE follower_id = $1
          )`,
    where: `NOT EXISTS (SELECT 1 FROM my_follows)
            OR p.user_id = $1
            OR p.user_id IN (SELECT following_id FROM my_follows)`,
  })
}

const linkClass = "text-primary hover:underline"

export default async function FeedPage() {
  const session = await auth()
  const username = session?.user?.name
  const userId = session?.user?.id
  const [posts, recentUsers, pokeCount, rawSchool] = userId
    ? await Promise.all([
        getPosts(userId),
        fetchRecentUsers(3),
        getUnacknowledgedPokeCount(),
        fetchUserSchool(userId),
      ])
    : [[], [], 0, null]

  // Pick the viewer's campus banner. Fall back to Cornell for legacy rows or an
  // unrecognized value so the banner always renders.
  const school: School = isValidSchool(rawSchool) ? rawSchool : "Cornell"

  return (
    <>
      <SchoolBanner school={school} />
      <main className="mx-auto grid max-w-container-max grid-cols-1 gap-gutter-wide px-gutter py-stack-lg md:grid-cols-12">
        <aside className="flex flex-col gap-stack-lg md:col-span-4 lg:col-span-3">
          <Panel title="Quick Search">
            <form action="/directory" className="flex flex-col gap-stack-md">
              <input
                name="q"
                aria-label="Search people"
                placeholder="Find people…"
                className="w-full rounded border border-outline-variant px-2 py-1.5 text-body-base focus:border-primary focus:outline-none"
              />
              <button className={buttonClass.primary}>Search</button>
            </form>
          </Panel>

          <Panel title="My SML" bodyClassName="">
            <AccordionSection title="My Profile" icon="person" defaultOpen>
              {username ? (
                <div className="flex flex-col gap-stack-md">
                  <div className="flex items-center gap-3">
                    <Link href={`/profile/${username}`} className="shrink-0">
                      <Avatar
                        userId={userId ?? ""}
                        username={username}
                        size="md"
                      />
                    </Link>
                    <div className="min-w-0">
                      <Link
                        href={`/profile/${username}`}
                        className="block truncate text-label-bold text-primary hover:underline"
                      >
                        {username}
                      </Link>
                      <p className="text-body-sm text-on-surface-variant">
                        {SCHOOL_META[school].name}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/profile/${username}/edit`}
                    className={`text-body-sm ${linkClass}`}
                  >
                    edit profile
                  </Link>
                </div>
              ) : (
                <p className="text-body-sm text-on-surface-variant">
                  Sign in to view your profile.
                </p>
              )}
            </AccordionSection>

            <AccordionSection title="Directory" icon="group">
              <div className="flex flex-col gap-stack-md">
                {recentUsers.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">
                    No members yet.
                  </p>
                ) : (
                  recentUsers.map((u) => (
                    <UserRow key={u.id} userId={u.id} username={u.username} />
                  ))
                )}
                <Link href="/directory" className={`text-body-sm ${linkClass}`}>
                  browse the directory
                </Link>
              </div>
            </AccordionSection>

            <AccordionSection title="My Pokes" icon="hub">
              <div className="flex flex-col gap-stack-md">
                <div className="flex items-center gap-2 text-body-sm text-on-surface">
                  <span className="rounded bg-surface-container px-1.5 py-0.5 text-caption font-bold text-on-surface-variant">
                    {pokeCount}
                  </span>
                  <span>
                    {pokeCount === 1 ? "new poke" : "new pokes"}
                  </span>
                </div>
                <Link href="/pokes" className={`text-body-sm ${linkClass}`}>
                  see your pokes
                </Link>
              </div>
            </AccordionSection>

            <AccordionSection title="Account" icon="settings">
              <div className="flex flex-col gap-stack-md">
                {username && (
                  <Link
                    href={`/profile/${username}/edit`}
                    className={`text-body-sm ${linkClass}`}
                  >
                    edit profile
                  </Link>
                )}
                <Link href="/directory" className={`text-body-sm ${linkClass}`}>
                  find people
                </Link>
              </div>
            </AccordionSection>
          </Panel>

          <Panel title="Upcoming Events">
            <ul className="flex flex-col gap-stack-md">
              {[
                { date: "MAY 7", label: "Slope Day" },
                { date: "FEB 1", label: "Cornell vs Harvard at Lynah" },
                { date: "APR 19", label: "Spring Concert" },
              ].map((ev) => (
                <li key={ev.label} className="flex items-center gap-2">
                  <span className="rounded bg-surface-container px-1.5 py-0.5 text-caption text-on-surface-variant">
                    {ev.date}
                  </span>
                  <span className="text-body-sm text-on-surface">{ev.label}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="flex flex-col gap-stack-md">
            <p className="text-caption text-outline">Sponsored</p>

            <AdBox>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined flex h-10 w-10 shrink-0 items-center justify-center rounded bg-carnelian text-on-carnelian">
                  storefront
                </span>
                <div className="min-w-0">
                  <p className="text-label-bold text-on-surface">
                    Cornell Bookstore — Big Red Gear
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    Hoodies, mugs, and Ithaca essentials. Show your colors.
                  </p>
                  <p className="mt-1 text-caption font-bold text-carnelian hover:text-carnelian-dark">
                    Shop now
                  </p>
                </div>
              </div>
            </AdBox>

            <AdBox>
              <div className="flex items-start gap-3">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  className="shrink-0"
                  aria-hidden
                >
                  <path
                    d="M2 8 h36 v8 a4 4 0 0 0 0 8 v8 H2 v-8 a4 4 0 0 0 0 -8 Z"
                    className="fill-carnelian"
                  />
                  <text
                    x="20"
                    y="23"
                    textAnchor="middle"
                    fontWeight="700"
                    fontSize="6"
                    className="fill-on-carnelian"
                  >
                    GAME DAY
                  </text>
                </svg>
                <div className="min-w-0">
                  <p className="text-label-bold text-on-surface">
                    Big Red Hockey vs Harvard — Lynah
                  </p>
                  <div className="mt-0.5 inline-block rounded bg-carnelian-tint px-1.5 py-0.5 text-caption font-bold text-carnelian">
                    SAT 7 PM
                  </div>
                  <p className="mt-1 text-caption font-bold text-carnelian hover:text-carnelian-dark">
                    Get tickets
                  </p>
                </div>
              </div>
            </AdBox>
          </div>
        </aside>

        <section className="flex flex-col gap-stack-lg md:col-span-8 lg:col-span-9">
          <h1 className="text-title-lg text-on-surface">Feed</h1>
          <PostForm />
          <div className="flex flex-col gap-stack-lg">
            {posts.length === 0 ? (
              <EmptyState
                icon="forum"
                message="No posts yet. Be the first to say something."
              />
            ) : (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </div>
        </section>
      </main>
    </>
  )
}
