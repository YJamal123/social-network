import Link from "next/link"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { FollowButton } from "@/components/FollowButton"
import { DirectorySearch } from "@/components/DirectorySearch"
import { Panel } from "@/components/Panel"
import { Avatar } from "@/components/Avatar"
import { EmptyState } from "@/components/EmptyState"

interface DirectoryRow {
  id: string
  username: string
  bio: string | null
  followed_by_me: boolean
}

async function getUsers(
  viewerId: string | null,
  q: string
): Promise<DirectoryRow[]> {
  const like = `%${q}%`
  const result = await query<DirectoryRow>(
    `SELECT u.id, u.username, u.bio,
            EXISTS (
              SELECT 1 FROM follows f
               WHERE f.follower_id = $1 AND f.following_id = u.id
            ) AS followed_by_me
       FROM users u
      WHERE ($2 = '' OR u.username ILIKE $3)
      ORDER BY u.username ASC
      LIMIT 100`,
    [viewerId, q, like]
  )
  return result.rows
}

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const session = await auth()
  const viewerId = session?.user?.id ?? null
  const q = (searchParams.q ?? "").trim()
  const users = await getUsers(viewerId, q)

  return (
    <main className="mx-auto flex max-w-container-max flex-col gap-gutter px-gutter py-stack-lg">
      <Panel title="search the network">
        <DirectorySearch initialQuery={q} />
      </Panel>

      <Panel
        title="Directory Results"
        action={
          <span className="text-caption text-outline">
            {users.length} {users.length === 1 ? "result" : "results"}
          </span>
        }
        bodyClassName=""
      >
        {users.length === 0 ? (
          <EmptyState
            icon="person_search"
            message={q ? `No users match “${q}”.` : "No users yet."}
          >
            {q && (
              <Link
                href="/directory"
                className="bracket-link text-action-link text-primary hover:underline"
              >
                clear search
              </Link>
            )}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-px bg-outline-variant sm:grid-cols-2">
            {users.map((u) => {
              const isSelf = viewerId === u.id
              return (
                <div
                  key={u.id}
                  className="flex gap-3 bg-white p-panel-padding transition-colors hover:bg-surface-container"
                >
                  <Avatar username={u.username} size="lg" />
                  <div className="min-w-0 flex-grow">
                    <Link
                      href={`/profile/${u.username}`}
                      className="block truncate text-label-bold text-primary hover:underline"
                    >
                      {u.username}
                    </Link>
                    {u.bio ? (
                      <p className="mb-2 truncate text-body-sm text-on-surface-variant">
                        {u.bio}
                      </p>
                    ) : (
                      <p className="mb-2 text-body-sm italic text-outline">No bio yet.</p>
                    )}
                    {viewerId && !isSelf && (
                      <FollowButton
                        targetUserId={u.id}
                        initialFollowing={u.followed_by_me}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </main>
  )
}
