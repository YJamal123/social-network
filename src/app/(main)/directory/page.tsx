import Link from "next/link"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { FollowButton } from "@/components/FollowButton"
import { DirectorySearch } from "@/components/DirectorySearch"

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
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Directory</h1>

      <DirectorySearch initialQuery={q} />

      <div className="space-y-3">
        {users.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            {q ? `No users match "${q}".` : "No users yet."}
          </p>
        ) : (
          users.map((u) => {
            const isSelf = viewerId === u.id
            return (
              <div
                key={u.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white">
                  {u.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${u.username}`}
                    className="font-semibold text-gray-800 hover:underline"
                  >
                    {u.username}
                  </Link>
                  {u.bio ? (
                    <p className="mt-0.5 truncate text-sm text-gray-600">
                      {u.bio}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-gray-400">
                      No bio yet.
                    </p>
                  )}
                </div>
                {viewerId && !isSelf && (
                  <FollowButton
                    targetUserId={u.id}
                    initialFollowing={u.followed_by_me}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}
