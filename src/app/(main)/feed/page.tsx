import Link from "next/link"
import { query } from "@/lib/db"
import { auth } from "@/lib/auth"
import { PostForm } from "@/components/PostForm"
import { PostCard } from "@/components/PostCard"
import { Panel } from "@/components/Panel"
import type { PostWithAuthor } from "@/lib/types"

async function getPosts(userId: string): Promise<PostWithAuthor[]> {
  // Posts from followed users + self, newest first. Fallback: if the user
  // follows nobody, show ALL posts so a new user's feed isn't empty.
  const result = await query<PostWithAuthor>(
    `WITH my_follows AS (
       SELECT following_id FROM follows WHERE follower_id = $1
     )
     SELECT p.id, p.user_id, p.content, p.created_at, u.username,
            (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
            EXISTS (
              SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1
            ) AS liked_by_me,
            (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count
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

function NavItem({
  href,
  icon,
  label,
}: {
  href: string
  icon: string
  label: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 px-panel-padding py-2 text-label-bold text-secondary transition-colors hover:bg-secondary-fixed-dim hover:text-on-secondary-fixed"
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span className="bracket-link">{label}</span>
    </Link>
  )
}

export default async function FeedPage() {
  const session = await auth()
  const username = session?.user?.name
  const posts = session?.user?.id ? await getPosts(session.user.id) : []

  return (
    <main className="mx-auto grid max-w-container-max grid-cols-1 gap-gutter px-gutter py-stack-lg md:grid-cols-12">
      <aside className="flex flex-col gap-stack-lg md:col-span-4 lg:col-span-3">
        <Panel title="Quick Search">
          <form action="/directory" className="flex flex-col gap-stack-md">
            <input
              name="q"
              placeholder="Find people…"
              className="w-full rounded border border-outline-variant px-2 py-1.5 text-body-base focus:border-primary focus:outline-none"
            />
            <button className="rounded bg-primary py-1.5 text-label-bold text-on-primary transition-opacity hover:opacity-90">
              Search
            </button>
          </form>
        </Panel>

        <Panel title="Navigation" bodyClassName="">
          <nav className="flex flex-col">
            {username && (
              <>
                <NavItem href={`/profile/${username}`} icon="person" label="my profile" />
                <div className="mx-panel-padding h-px bg-outline-variant" />
              </>
            )}
            <NavItem href="/directory" icon="group" label="directory" />
            <div className="mx-panel-padding h-px bg-outline-variant" />
            <NavItem href="/pokes" icon="hub" label="my pokes" />
            {username && (
              <>
                <div className="mx-panel-padding h-px bg-outline-variant" />
                <NavItem
                  href={`/profile/${username}/edit`}
                  icon="settings"
                  label="edit profile"
                />
              </>
            )}
          </nav>
        </Panel>
      </aside>

      <section className="flex flex-col gap-stack-lg md:col-span-8 lg:col-span-9">
        <PostForm />
        <div className="flex flex-col gap-stack-lg">
          {posts.length === 0 ? (
            <div className="border border-outline-variant bg-surface-container-lowest p-8 text-center text-body-base text-outline shadow-sm">
              No posts yet. Be the first to say something.
            </div>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </section>
    </main>
  )
}
