import { getPrisma } from "@/lib/db"
import type { PostWithAuthor, RecentUser } from "@/lib/types"

/**
 * Shared post-with-engagement reader. Returns posts joined with their author
 * plus like_count / liked_by_me / comment_count, newest first, capped at 50.
 *
 * The current viewer's id is always bound to `$1` (used to compute
 * `liked_by_me`); the caller's `where` clause and any extra `params` start at
 * `$2`. `cte` optionally prepends a `WITH … ` block that `where` can reference.
 *
 * Kept as a parameterized `$queryRawUnsafe` (via the Prisma engine, not pg): the
 * dynamic cte/where + correlated count subqueries are far clearer in SQL than in
 * the typed Prisma API, and this preserves the exact `PostWithAuthor` shape.
 * Every value is still bound as a placeholder — nothing is interpolated.
 *
 * NOTE on `::uuid` casts: unlike node-postgres, Prisma binds string params as
 * `text`, so a bare `uuid_col = $n` errors ("operator does not exist: uuid =
 * text"). Every placeholder compared against a uuid column is cast `$n::uuid`
 * here AND in the caller-supplied `cte`/`where` (see feed/profile pages).
 * Server-only — never import into the edge bundle.
 */
export async function fetchPosts(opts: {
  viewerId: string | null
  cte?: string
  where: string
  params?: unknown[]
}): Promise<PostWithAuthor[]> {
  const { viewerId, cte = "", where, params = [] } = opts
  return getPrisma().$queryRawUnsafe<PostWithAuthor[]>(
    `${cte}
     SELECT p.id, p.user_id, p.content, p.created_at, u.username,
            (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
            EXISTS (
              SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1::uuid
            ) AS liked_by_me,
            (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE ${where}
      ORDER BY p.created_at DESC
      LIMIT 50`,
    viewerId,
    ...params
  )
}

/**
 * The signed-in viewer's school (raw text from `users.school`, may be NULL).
 * Used by the feed to pick the campus banner. Returns `null` if the user row
 * is missing or has no school set. Server-only.
 */
export async function fetchUserSchool(userId: string): Promise<string | null> {
  const row = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { school: true },
  })
  return row?.school ?? null
}

/**
 * Newest members first — used by the dashboard Directory accordion preview.
 * Server-only.
 */
export async function fetchRecentUsers(limit = 3): Promise<RecentUser[]> {
  return getPrisma().user.findMany({
    select: { id: true, username: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}
