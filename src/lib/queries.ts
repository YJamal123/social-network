import { query } from "@/lib/db"
import type { PostWithAuthor } from "@/lib/types"

/**
 * Shared post-with-engagement reader. Returns posts joined with their author
 * plus like_count / liked_by_me / comment_count, newest first, capped at 50.
 *
 * The current viewer's id is always bound to `$1` (used to compute
 * `liked_by_me`); the caller's `where` clause and any extra `params` start at
 * `$2`. `cte` optionally prepends a `WITH … ` block that `where` can reference.
 * Server-only: imports the pg `query()` — never import from the edge bundle.
 */
export async function fetchPosts(opts: {
  viewerId: string | null
  cte?: string
  where: string
  params?: unknown[]
}): Promise<PostWithAuthor[]> {
  const { viewerId, cte = "", where, params = [] } = opts
  const result = await query<PostWithAuthor>(
    `${cte}
     SELECT p.id, p.user_id, p.content, p.created_at, u.username,
            (SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
            EXISTS (
              SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1
            ) AS liked_by_me,
            (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
      WHERE ${where}
      ORDER BY p.created_at DESC
      LIMIT 50`,
    [viewerId, ...params]
  )
  return result.rows
}
