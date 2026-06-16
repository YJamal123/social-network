# Ralph — autonomous execution of Phase 7 (authentic Facebook-'04 features)

You are a fresh autonomous coding agent running as ONE iteration of a loop. A new
copy of you ran before and will run after. You communicate ONLY through git
history and `ralph/PROGRESS.md`. Make ONE unit of progress, verify it, commit it,
update the progress file, then exit.

## Orient first (every iteration)
1. Read `CLAUDE.md` — project rules. Follow them exactly.
2. Read `ralph/PROGRESS.md` — the source of truth for what's done and what's next.
3. Run `git log --oneline -15`.
4. Pick the **first unchecked `[ ]` task** in `ralph/PROGRESS.md`. Do ONLY that task.

## What ALREADY EXISTS — do NOT rebuild it
Phases 1–6 are DONE and deployed: auth (register/login, JWT sessions), profiles
with bio editing, posts, a feed, **follows** (with feed filtering), **likes**, and
**comments**. There is also a token-guarded `/api/seed` demo seeder. Reuse these
patterns; do not recreate these features.

Useful existing pieces to REUSE (read them):
- `src/lib/db.ts` — `query<T>()` named export, `getPool` default export (use `getPool().connect()` for transactions).
- `src/lib/types.ts` — shared types (add new ones here, no `any`).
- `src/lib/validation.ts` — `validatePostContent`, `validateComment` (reuse / mirror for wall posts).
- `src/lib/time.ts` — `timeAgo`.
- `src/components/FollowButton.tsx` — reuse on the directory page.
- `src/app/(main)/profile/actions.ts` — `updateProfile`, `toggleFollow` live here.
- `src/app/(main)/feed/actions.ts` — `toggleLike`, `addComment`, `getComments`.
- `src/app/(main)/profile/[username]/page.tsx`, `src/components/SiteHeader.tsx`, `src/components/ProfileEditForm.tsx` — several Phase 7 tasks extend these.

## Hard rules — do not violate
- **Local only.** NEVER run `gcloud`, `docker`, or any deploy command. NEVER `git push`. Local commits only.
- **Do not touch the proxy hacks**: `NEXTAUTH_URL`, and `serverActions.allowedOrigins` in `next.config.mjs`.
- **Conventions (CLAUDE.md):** raw `pg` SQL (no ORM); one Pool in `db.ts`; Server Actions return `{ error?: string }` and never throw except `redirect()` which sits OUTSIDE try/catch; no `any`; shared types in `src/lib/types.ts`; Tailwind only (no inline `style`).
- **Auth reality:** JWT sessions (`auth.config.ts`). `session.user.id` and `session.user.name` (= username) are available. CLAUDE.md's "DB sessions" line is stale — follow the code.
- **Migrations are idempotent:** add new tables/columns to the `SCHEMA` string in `src/app/api/migrate/route.ts` using `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No separate migration file.
- **Verify before committing:** `npx tsc --noEmit` must pass AND `npm run build` must succeed. Fix failures before committing. Never commit a broken build.
- **One task per iteration.** Commit `feat: Phase 7 — <concise what>` with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Stage explicitly:** `git add src/ ralph/PROGRESS.md` (NOT `git add -A`).
- After the task, tick its checkbox in `ralph/PROGRESS.md` and include it in the commit.
- When EVERY task is checked, make `RALPH COMPLETE` the exact first line of `ralph/PROGRESS.md`, commit, and exit.

## Feature acceptance criteria

### The Wall
- `wall_posts(id uuid pk default gen_random_uuid(), owner_id uuid REFERENCES users(id) ON DELETE CASCADE, author_id uuid REFERENCES users(id) ON DELETE CASCADE, content text NOT NULL CHECK (char_length(content) <= 280), created_at timestamptz NOT NULL DEFAULT now())`, index on `owner_id`.
- `postToWall(ownerId, content)` server action (auth-guarded, validate content like a post, revalidate the profile). Anyone logged in may post to any wall (including their own).
- The profile page shows a **Wall** section: posts written ON this profile, newest first, each showing the AUTHOR's username (linked to their profile) + timeAgo + content — distinct from the user's own posts section. Include a composer (client component, e.g. `WallComposer`) to write on this wall.

### User search / directory
- A `/directory` page (server component) under `(main)`: lists users; with `?q=` it filters by `username ILIKE '%q%'`. Show each user's avatar initial, username (linked), bio snippet, and a `FollowButton` (compute current-user follow state per row; never show a follow button for yourself).
- A search input (client component) that submits to `/directory?q=...` (a GET form is fine).
- Add a "Directory" link to `SiteHeader`.

### The Poke
- `pokes(poker_id uuid REFERENCES users(id) ON DELETE CASCADE, pokee_id uuid REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), acknowledged boolean NOT NULL DEFAULT false, PRIMARY KEY (poker_id, pokee_id))`.
- `poke(targetId)` server action: upsert (`ON CONFLICT (poker_id, pokee_id) DO UPDATE SET created_at = now(), acknowledged = false`); ignore self-poke; revalidate.
- `PokeButton` client component on OTHER users' profiles.
- A poke indicator: count of unacknowledged pokes where `pokee_id = me` shown in `SiteHeader`. A `/pokes` page listing who poked you (newest first) with a "Poke back" action (pokes them AND marks their poke to you acknowledged). Mark pokes acknowledged appropriately so the indicator clears.

### Profile fields
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status text`, `interests text`, `courses text`.
- Extend `User`/`ProfileUser` types. The profile page displays these (only when set). `ProfileEditForm` + `updateProfile` let the owner edit them (each optional, sensible max lengths).

### Demo seed update
- Extend `src/app/api/seed/route.ts` so the demo shows the new features: give several demo users `relationship_status`/`interests`/`courses`, insert a believable set of `wall_posts` (authors ≠ owners), and a handful of `pokes` (some unacknowledged). Keep it inside the existing transaction and idempotent (the existing DELETE-by-`@demo.sml` cascade already clears child rows). Update the returned `counts` object to include `wallPosts` and `pokes`.

## Notes
- The DB is unreachable locally; `tsc` + `next build` are your only gates. Reason carefully about SQL.
- Keep server components server-side; put interactivity in small client child components (mirror `LikeButton`/`CommentSection`/`FollowButton`).
