# Next-Features Progress — schools, Taunt, scoreboard, relationships, profile fields

Derived from `.claude/NEXT-FEATURES.md`. Each iteration: do the FIRST unchecked
task, mirror the Poke stack where noted, verify (`tsc` + `build`, plus `npm test`
if a `*.test.ts` changed), commit, tick it. When all are checked, make `RALPH
COMPLETE` the exact first line of this file and commit.

## Feature 1 — School field + Ivy League picker
- [x] 1. `src/lib/schools.ts`: `SCHOOLS` (Brown, Columbia, Cornell, Dartmouth, Harvard, Penn, Princeton, Yale) + `isValidSchool()`; add `src/lib/schools.test.ts`. Migrate: `ALTER TABLE users ADD COLUMN IF NOT EXISTS school TEXT`. Add `school: string | null` to `User`, `ProfileUser`, `DirectoryRow` in types.ts.
- [x] 2. Register: `<select name="school">` in `register/page.tsx`; in `register/actions.ts` require + validate against `SCHOOLS`, add to the INSERT.
- [x] 3. Edit/display: `updateProfile` validates + persists `school`; `<select>` in `ProfileEditForm.tsx` (thread `initialSchool` from the edit page); add `school` to `getProfile` SELECT + an InfoRow on the profile; add `school` to `getUsers` SELECT + a tag in the directory `UserRow` subtitle.

## Feature 2 — Taunt (cross-school Poke variant)
- [x] 4. Migrate: `taunts` table (mirror `pokes`: taunter_id, tauntee_id, created_at, acknowledged, PK pair) + `taunts_tauntee_id_idx`. Types `Taunt`, `TauntWithTaunter` (taunter_username, taunter_school).
- [x] 5. `src/app/(main)/taunts/actions.ts` (fork `pokes/actions.ts`): `taunt(targetId)` with auth guard, self no-op, AND same-school guard (reject if same school or either null); `getUnacknowledgedTauntCount`, `tauntBack`, `acknowledgeTaunts`, `getTaunters`.
- [x] 6. `TauntButton.tsx` (fork PokeButton, label "Taunt!") + `TauntBackButton.tsx` + `TauntsAck.tsx`. On `profile/[username]/page.tsx` Connection panel: render `TauntButton` when viewer.school ≠ profile.school else `PokeButton` (thread both schools from the page).
- [x] 7. `/taunts/page.tsx` (fork `/pokes/page.tsx`) with `tauntBack`; add a "taunts" nav link + coral count badge in `SiteHeader.tsx` (reuse poke-badge markup, `getUnacknowledgedTauntCount`).

## Feature 3 — Head-to-head Rivalry Stats
- [x] 8. `getHeadToHead(schoolA, schoolB)` in `taunts/actions.ts` (COUNT taunts grouped by taunter school, filtered to the two schools; no new schema). Render "SchoolA N — M SchoolB" on the `/taunts` page header (viewer's school vs most-recent taunter's school, fallback Cornell vs Harvard).

## Feature 4 — "In a Relationship with [link]" (mutual confirm)
- [x] 9. Migrate: `relationships` table (requester_id, addressee_id, status, confirmed, created_at, PK pair). Keep legacy free-text `users.relationship_status` for solo statuses. Types `Relationship`, `RelationshipWithPartner`.
- [x] 10. `profile/actions.ts`: `proposeRelationship(addresseeId, status)` (upsert confirmed=false, reject self, clear prior unconfirmed), `confirmRelationship(requesterId)`, `getPendingRelationshipRequests` + count.
- [x] 11. `ProfileEditForm.tsx`: status `<select>` + optional partner-username field calling `proposeRelationship`. Profile Information panel: when confirmed, render "In a relationship with @partner" linked.
- [x] 12. Requests surface (fork `/pokes/page.tsx` shape) with `confirmRelationship`; pending indicator in `SiteHeader.tsx`.

## Feature 5 — "Interested In" + "Looking For"
- [ ] 13. Migrate: `ALTER TABLE users ADD COLUMN IF NOT EXISTS interested_in TEXT` + `looking_for TEXT` (comma-joined like `interests`). `updateProfile` reads/validates (server-side whitelist) + persists both. Add to `User`/`ProfileUser` types. `ProfileEditForm.tsx`: checkbox groups (Interested in: Men/Women; Looking For: Friendship/A relationship/Dating/Whatever I can get/Random play) comma-joined; render two InfoRows on the profile.

## Seed + wrap-up
- [ ] 14. Extend `src/app/api/seed/route.ts`: give demo users varied Ivy `school` values, a few cross-school `taunts` (some unacknowledged), one or two confirmed `relationships`, and `interested_in`/`looking_for` values. Keep in the existing idempotent transaction; add the new counts to the returned JSON.
- [ ] 15. Final pass: `npx tsc --noEmit` + `npm run build` + `npm test` all clean; self-review against NEXT-FEATURES.md + CLAUDE.md guardrails (raw pg, {error?}, no any, Tailwind only, self-guards, edge boundary); then mark complete.
