# Phase 7 Progress — authentic Facebook-'04 features

Source of truth for the Ralph loop. Each iteration: do the FIRST unchecked task,
verify (`tsc` + `build`), commit, tick it. When all are checked, make `RALPH
COMPLETE` the exact first line of this file and commit.

## Foundation
- [x] 1. Migrate SCHEMA (`src/app/api/migrate/route.ts`): add `wall_posts` and `pokes` tables (+ indexes), and `ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status / interests / courses`. All idempotent.
- [x] 2. Types (`src/lib/types.ts`): add `WallPost`, `WallPostWithAuthor`, `Poke`; extend `User` and `ProfileUser` with `relationship_status`, `interests`, `courses`.

## The Wall
- [x] 3. `postToWall(ownerId, content)` server action + a `getWallPosts(ownerId)` helper (or inline query) returning posts joined with author username, newest first.
- [x] 4. `WallComposer` client component (write on a wall, optimistic-friendly, ≤280 chars).
- [x] 5. Profile page: a Wall section (author-attributed posts + composer), distinct from the user's own posts.

## User search / directory
- [ ] 6. `/directory` page (server component): list users, `?q=` filters by `username ILIKE`, each row shows avatar/username/bio + a `FollowButton` (per-row follow state; none for self).
- [ ] 7. Search input client component submitting to `/directory?q=...`, and a "Directory" link in `SiteHeader`.

## The Poke
- [ ] 8. `poke(targetId)` server action (upsert, ignore self-poke, revalidate) + helpers to count unacknowledged pokes and list pokers.
- [ ] 9. `PokeButton` client component on other users' profiles.
- [ ] 10. Unacknowledged-poke indicator in `SiteHeader` + a `/pokes` page (who poked you, "Poke back" that pokes them and acknowledges theirs).

## Profile fields
- [ ] 11. Profile page displays `relationship_status`/`interests`/`courses` (when set); `ProfileEditForm` + `updateProfile` let the owner edit them.

## Demo seed + wrap-up
- [ ] 12. Extend `src/app/api/seed/route.ts`: demo `relationship_status`/`interests`/`courses`, a set of `wall_posts` (author ≠ owner), some `pokes` (a few unacknowledged); include `wallPosts` + `pokes` in the returned counts; keep it in the existing idempotent transaction.
- [ ] 13. Final pass: `npx tsc --noEmit` + `npm run build` clean; self-review all Phase 7 code for convention adherence; then mark complete.
