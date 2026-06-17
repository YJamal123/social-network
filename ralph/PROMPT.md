# Ralph — autonomous build of the NEXT 5 FEATURES (schools, Taunt, scoreboard, relationships, profile fields)

You are a fresh autonomous coding agent running as ONE iteration of a loop. A new
copy of you ran before and will run after. You communicate ONLY through git
history and `ralph/PROGRESS.md`. Make ONE unit of progress, verify it, commit it,
update the progress file, then exit.

## Orient first (every iteration)
1. Read `CLAUDE.md` — project rules. Follow exactly.
2. Read `.claude/NEXT-FEATURES.md` — the authoritative spec (vision, per-feature schema/actions/UI/mount points). This checklist derives from it.
3. Read `ralph/PROGRESS.md` — source of truth for what's done / next.
4. Pick the **first unchecked `[ ]` task**. Do ONLY that task.
5. The Poke stack is the fork template for Taunt and the confirm-mechanic for relationships — READ `src/app/(main)/pokes/actions.ts`, `src/components/PokeButton.tsx`, `PokeBackButton.tsx`, `PokesAck.tsx`, `src/app/(main)/pokes/page.tsx`, and how `SiteHeader.tsx` shows the poke count badge. Mirror those patterns.

## Hard rules — do not violate
- **Local only.** NEVER run `gcloud`/`docker`/deploy. NEVER `git push`. Local commits only.
- **Do not touch the proxy hacks** in `next.config.mjs` (`allowedOrigins`, `bodySizeLimit`).
- **Raw `pg` only, no ORM.** New schema lands ONLY in the idempotent `src/app/api/migrate/route.ts` (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).
- **Mutations = Server Actions returning `{ error?: string }`, never throw** (except `redirect()` outside try/catch). Self-targeting actions no-op or reject (mirror poke/follow).
- **One Pool** via `query()` from `src/lib/db.ts`. **No `any`** — all shapes in `src/lib/types.ts`. **Tailwind only**, no inline `style`, no raw hex; reuse `fieldClass`/`buttonClass` from `src/lib/ui.ts` and existing primitives (`Avatar`, `UserRow`, `Panel`, `EmptyState`, `UserNameTime`).
- **Keep pure logic in `src/lib/`** (e.g. `schools.ts` validation, looking-for/interested-in whitelists) and ADD a Vitest test for it (e.g. `src/lib/schools.test.ts`) — the project has vitest; pure validators must be covered.
- **Edge boundary:** never import `pg`/`bcrypt` into `auth.config.ts`/`middleware.ts`.
- **Behavior intact:** don't break existing auth, feed filter, poke/like/follow/comment/wall.
- **Verify before committing:** `npx tsc --noEmit` AND `npm run build` MUST pass. Also run `npm test` if you added/changed a `*.test.ts`. Fix failures before committing.
- **One task per iteration.** Commit `feat: features <task>` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Stage explicitly: `git add src/ ralph/PROGRESS.md` (+ `tailwind.config.ts` if changed). NOT `git add -A`.
- Tick the task's checkbox in `ralph/PROGRESS.md` in the same commit.
- When EVERY task is checked, make `RALPH COMPLETE` the exact first line of `ralph/PROGRESS.md`, commit, and exit.

## Key spec reminders (full detail in NEXT-FEATURES.md)
- **#1 School:** `school` required + validated against `SCHOOLS` (8 Ivies) at BOTH register and updateProfile. New pure `src/lib/schools.ts` (+ test). Thread `school` into User/ProfileUser/DirectoryRow, the register & edit `<select>`, the profile Information panel, and the directory `UserRow` subtitle.
- **#2 Taunt:** `taunts` table mirrors `pokes`. `taunt()` adds a same-school guard (reject if same school OR either school null). Fork the whole poke component/action tree (`/taunts` route, `TauntButton`/`TauntBackButton`/`TauntsAck`, header count badge). On a profile: render `TauntButton` when viewer.school ≠ profile.school, else the existing `PokeButton` (thread both schools down from the page).
- **#3 Scoreboard:** `getHeadToHead(a,b)` COUNT by taunter school; render "Cornell N — M Harvard" on `/taunts`. No new schema.
- **#4 Relationship:** new `relationships` table (one row per pair, `confirmed`). KEEP legacy free-text `users.relationship_status` for solo statuses; the table is only for a linked partner. `proposeRelationship`/`confirmRelationship`/pending-count mirror the poke confirm pattern. Profile shows "In a relationship with @partner" (linked) when confirmed; a Requests surface + header indicator.
- **#5 Interested In / Looking For:** `interested_in`, `looking_for` TEXT columns (comma-joined like `interests`); checkboxes in ProfileEditForm with a server-side whitelist; two InfoRows on the profile.
- **Seed:** extend `src/app/api/seed/route.ts` so demo users have varied Ivy schools, a few cross-school taunts, a confirmed relationship or two, and interested_in/looking_for — so the features visibly demo. Keep it in the existing idempotent transaction; update returned counts.

## Notes
- DB is unreachable locally; `tsc` + `next build` (+ `npm test` for pure logic) are your gates. Reason carefully about SQL.
- Keep server components server-side; interactivity in small client children (mirror PokeButton).
