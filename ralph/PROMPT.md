# Ralph — autonomous execution of Phase 6 (SML Social Network)

You are a fresh autonomous coding agent running as ONE iteration of a loop. A new
copy of you ran before and will run after. You communicate with them ONLY through
git history and `ralph/PROGRESS.md`. Make ONE unit of progress, verify it, commit
it, update the progress file, then exit.

## Orient first (do this every time)
1. Read `CLAUDE.md` — project rules. Follow them exactly.
2. Read `ralph/PROGRESS.md` — the source of truth for what's done and what's next.
3. Run `git log --oneline -15` to see what already happened.
4. Pick the **first unchecked `[ ]` task** in `ralph/PROGRESS.md`. Do ONLY that task.

## Hard rules — do not violate
- **Local only.** NEVER run `gcloud`, `docker`, or any deploy command. NEVER `git push`. Commits to the local repo only.
- **Do not touch the proxy hacks**: `NEXTAUTH_URL`, and `serverActions.allowedOrigins` in `next.config.mjs`. Leave them as-is.
- **Conventions (from CLAUDE.md):** raw `pg` SQL only (no ORM); one Pool in `src/lib/db.ts`; Server Actions return `{ error?: string }` and never throw except `redirect()`, which must sit OUTSIDE the try/catch; no `any`; all shared types in `src/lib/types.ts`; Tailwind classes only (no inline `style`).
- **Auth reality:** sessions are JWT (`src/lib/auth.config.ts`). `session.user.id` and `session.user.name` (= username) are available. CLAUDE.md says "DB sessions" — that is stale; follow the code.
- **Migrations are idempotent:** add new tables to the `SCHEMA` string in `src/app/api/migrate/route.ts` using `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Do not create a separate migration file.
- **Verify before committing:** `npx tsc --noEmit` must pass AND `npm run build` must succeed. If either fails, FIX IT before committing. Never commit a broken build.
- **One task per iteration.** Keep the change focused. Then commit with a message `feat: Phase 6 — <concise what>` and the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Stage explicitly:** `git add src/ ralph/PROGRESS.md` (and `src/app/api/migrate/route.ts`). Do NOT `git add -A` (keeps logs/junk out).
- After the task is committed, tick its checkbox in `ralph/PROGRESS.md` (change `[ ]` to `[x]`) and include that in the commit.
- When EVERY task is checked, add a line exactly `PHASE6 COMPLETE` as the very first line of `ralph/PROGRESS.md`, commit it, and exit.

## Feature acceptance criteria

### 6a — Follows
- `follows(follower_id, following_id)` table, PK on the pair, both FK → users ON DELETE CASCADE.
- `toggleFollow(targetUserId)` server action: insert if not following, delete if following; ignore self-follow; revalidate affected paths. Return `{ error?: string }`.
- `FollowButton` client component (optimistic via `useTransition`), shown on OTHER users' profiles only (never your own).
- Profile page shows **follower** and **following** counts.
- Feed shows posts from **followed users + yourself**, ordered newest first. **Fallback:** if you follow nobody, show ALL posts (so a new user's feed isn't empty).

### 6b — Likes
- `likes(user_id, post_id)` table, PK on the pair, both FK → ON DELETE CASCADE.
- `toggleLike(postId)` server action (insert/delete), revalidate. Return `{ error?: string }`.
- Extend the feed AND profile post queries to also select `like_count` (int) and `liked_by_me` (bool, based on the current session user).
- `LikeButton` client component (heart outline/filled + count, optimistic via `useTransition`), integrated into `PostCard`. Extend `PostWithAuthor` with `like_count` and `liked_by_me`.

### 6c — Comments
- `comments(id uuid pk default gen_random_uuid(), post_id uuid fk, user_id uuid fk, content text not null check (char_length(content) <= 280), created_at timestamptz default now())`, FKs ON DELETE CASCADE, index on `post_id`.
- `addComment(postId, content)` and `getComments(postId)` server actions. `getComments` returns each comment joined with author `username`, oldest first.
- Extend post queries with `comment_count` (int); add it to `PostWithAuthor`.
- `CommentSection` client component integrated into `PostCard`: shows the comment count; clicking toggles an inline thread that **lazily loads** comments via `getComments` on first expand; includes a composer (≤280 chars) that calls `addComment` and refreshes the thread.

## Notes
- The DB is unreachable locally, so you cannot run the app. `tsc` + `next build` are your gates. Reason carefully about SQL and types.
- Keep `PostCard` a server component; put interactivity (like/comment) in child client components it renders.
- Add types to `src/lib/types.ts` as needed (`Follow`, `Like`, `Comment`, and the `PostWithAuthor` extensions). No `any`.
