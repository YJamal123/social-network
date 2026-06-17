# SML — Next 5 Features (decision doc)

**Vision:** Turn the hardcoded Cornell chrome into a real, school-segmented network, then layer on the two most iconic TheFacebook-2004 mechanics — the cross-school rivalry _Taunt_ and the mutually-confirmed _relationship link_ — finished off with the verbatim period profile fields. One demo narrative: **pick your Ivy → taunt a rival → watch the scoreboard → lock in a relationship → fill the classic profile fields.**

This is a **decision doc only** — no `src/` was modified. All specs reuse existing, verified patterns (see file references). Build in the ranked order below; each feature is feasible with raw `pg` + Server Actions + Tailwind, no new infra, per `CLAUDE.md`.

---

## The 5 (ranked)

### 1. School field on profiles + Ivy League picker  — effort: S
**Why:** Foundation for the entire rivalry cluster (#2, #3). De-hardcodes the Cornell banner into a real per-user attribute. Maximally era-authentic: TheFacebook launched school-by-school; "what school" was the first identity question. Double-keep on both critic lenses.

- **Schema** (`src/app/api/migrate/route.ts`, append to the `ADD COLUMN` block, same style as `relationship_status`):
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS school TEXT;`
- **Const:** new `src/lib/schools.ts` — `export const SCHOOLS = ["Brown","Columbia","Cornell","Dartmouth","Harvard","Penn","Princeton","Yale"] as const` + `isValidSchool(s): boolean`. Pure, unit-testable (add `schools.test.ts`).
- **Server actions:**
  - `register` (`src/app/(auth)/register/actions.ts`): read `formData.get("school")`, validate against `SCHOOLS` (reject if absent/invalid), add to the `INSERT INTO users (... school)`.
  - `updateProfile` (`src/app/(main)/profile/actions.ts`): validate `school` against `SCHOOLS`, add `school = $N` to the `UPDATE`.
- **Types** (`src/lib/types.ts`): add `school: string | null` to `User`, `ProfileUser`, `DirectoryRow`.
- **UI / mount points:**
  - `register/page.tsx`: a `<select name="school">` (reuse `fieldClass` from `src/lib/ui.ts`).
  - `ProfileEditForm.tsx`: `<select name="school">` next to Relationship status; thread `initialSchool` from the edit page.
  - `profile/[username]/page.tsx`: add `u.school` to `getProfile` SELECT; render as an `InfoRow` ("School").
  - `directory/page.tsx`: add `u.school` to `getUsers` SELECT; render as a small tag in each `UserRow` subtitle.

### 2. Taunt — a cross-school Poke variant  — effort: M
**Why:** The seed idea's payoff and the single most memorable demo beat (taunt + taunt-back + "Cornell vs Harvard"). Near-mechanical fork of the verified poke stack; only genuinely new logic is one same-school guard. Double-keep, high demo value on both lenses. Depends on #1. Chosen over the Rivalry Wall — both critics flag them as redundant ("pick one"); Taunt is cheaper, more iconic, and reuses the poke stack verbatim.

- **Schema** (migrate route): mirror `pokes` exactly —
  ```sql
  CREATE TABLE IF NOT EXISTS taunts (
    taunter_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tauntee_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged BOOLEAN     NOT NULL DEFAULT false,
    PRIMARY KEY (taunter_id, tauntee_id)
  );
  CREATE INDEX IF NOT EXISTS taunts_tauntee_id_idx ON taunts(tauntee_id);
  ```
- **Server actions** (`src/app/(main)/taunts/actions.ts`, fork of `pokes/actions.ts`):
  - `taunt(targetId)` — `auth()` guard, self no-op, **then a guard query**: `SELECT school FROM users WHERE id IN (taunter, tauntee)`; reject with `{ error: "You can only taunt rival schools" }` if same school or either school is null. Then the same `INSERT ... ON CONFLICT DO UPDATE SET created_at=now(), acknowledged=false`. `revalidatePath("/profile/[username]","page")` + `/taunts`.
  - `getUnacknowledgedTauntCount()`, `tauntBack(taunterId)`, `acknowledgeTaunts()`, `getTaunters()` — copy poke equivalents 1:1 against `taunts`.
- **Types:** `Taunt`, `TauntWithTaunter` (add `taunter_username`, `taunter_school`).
- **UI / mount points:**
  - `TauntButton.tsx` (fork `PokeButton`): label "Taunt!", success "Taunted!". Mount on `profile/[username]/page.tsx` in the Connection panel — **render `TauntButton` when viewer.school ≠ profile.school, else the existing `PokeButton`** (pass both schools down from the page).
  - `TauntBackButton.tsx` (fork `PokeBackButton`); `TauntsAck.tsx` (fork `PokesAck`).
  - `/taunts/page.tsx` (fork `/pokes/page.tsx`): "Your Taunts" list with `tauntBack`.
  - `SiteHeader.tsx`: add a `taunts` nav link with the coral count badge (reuse the existing `pokeCount` badge markup; call `getUnacknowledgedTauntCount`).
- **Accepted debt:** duplicates the poke component/action tree rather than parameterizing it. Fine for demo speed; note as future consolidation.

### 3. Head-to-head Rivalry Stats (taunt scoreboard)  — effort: S
**Why:** Cheapest way to make Taunt feel consequential — the "Cornell 14 — 9 Harvard" line that gets the laugh. Zero new schema, no write path. Double-keep, high demo value. Depends on #2 (satisfied here). Chosen over the School Pride Leaderboard (only maybe-rated, leans gamification, thin on seed data) to keep the rivalry cluster mechanic-driven.

- **Schema:** none.
- **Server action / query** (`src/app/(main)/taunts/actions.ts`): `getHeadToHead(schoolA, schoolB)` — `COUNT(*)::int` over `taunts t JOIN users tr ON tr.id=t.taunter_id JOIN users te ON te.id=t.tauntee_id`, grouped by `tr.school`, filtered to the two schools. Reuses the verified `COUNT(*)::int` aggregation pattern. Returns `{ a: number, b: number }`.
- **UI / mount points:**
  - Inline on `/taunts/page.tsx` header: "Cornell N — M Harvard" rendered server-side (viewer's school vs the school of their most recent taunter, or a fixed Cornell-vs-Harvard demo pairing).
  - Optional: same line on the school directory header (#runner-up "School directory").

### 4. "In a Relationship with [link]" — mutual-confirm relationship  — effort: M
**Why:** Arguably THE signature 2004 feature — type dropdown + mutual confirmation drove the gossip engine. Highest authenticity + drama of any non-rivalry idea, and adds variety (a second confirm-mechanic that isn't a poke-skin). Architecturally it's the poke confirm/acknowledge pattern again. Double-keep.

- **Schema** (migrate route): canonicalized one-row-per-pair —
  ```sql
  CREATE TABLE IF NOT EXISTS relationships (
    requester_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL,   -- 'In a relationship' | "It's complicated" | 'Married' | 'In an open relationship'
    confirmed    BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (requester_id, addressee_id)
  );
  ```
  Keep the existing free-text `users.relationship_status` for solo statuses (Single / Married-unlinked); the table only models a **linked** partner.
- **Server actions** (`src/app/(main)/profile/actions.ts`):
  - `proposeRelationship(addresseeId, status)` — upsert, `confirmed=false`; self-link rejected; one outstanding link per requester (clear prior unconfirmed). `{error?}` shape.
  - `confirmRelationship(requesterId)` — set `confirmed=true` (mirrors `pokeBack`).
  - `getPendingRelationshipRequests()` / count for the indicator (mirrors `getUnacknowledgedPokeCount`).
- **Types:** `Relationship`, `RelationshipWithPartner` (partner username).
- **UI / mount points:**
  - `ProfileEditForm.tsx`: replace the free-text relationship `<input>` with a status `<select>` + an optional partner-username field that calls `proposeRelationship`.
  - `profile/[username]/page.tsx` Information panel: when confirmed, render "In a relationship with **@partner**" with a `Link` to the partner (reuse the profile-link convention).
  - A small "Requests" surface (reuse `/pokes/page.tsx` shape) with `confirmRelationship`; indicator in `SiteHeader`.
- **Watch:** the dropdown must coexist with legacy `relationship_status`; confirm flow needs the pending surface. Higher effort than a poke due to two-sided state, but fully feasible.

### 5. "Interested In" + "Looking For" structured dropdowns  — effort: S
**Why:** Verbatim 2004 profile fields — "Looking For: Random play / Whatever I can get" is one of the most-remembered period details, instant recognition. Pure profile-field work on the verified `interests`/`courses` comma-joined path: no new action, no new table. Double-keep, S effort. Balances the slate with a static-content feature alongside the four data/mechanic ones.

- **Schema** (migrate route): `ALTER TABLE users ADD COLUMN IF NOT EXISTS interested_in TEXT;` and `... looking_for TEXT;` (comma-joined sets, exactly like `interests`).
- **Server action:** extend `updateProfile` to read/validate/persist both fields in the existing `UPDATE` (canned-option whitelist server-side; reuse the length-cap style).
- **Types:** add `interested_in`, `looking_for` to `User` and `ProfileUser`.
- **UI / mount points:**
  - `ProfileEditForm.tsx`: "Interested in" (Men / Women — checkboxes) and "Looking For" (Friendship / A relationship / Dating / Whatever I can get / Random play — checkboxes), comma-joined into the field on submit.
  - `profile/[username]/page.tsx`: render as two `InfoRow`s in the Information `<dl>`.

---

## Runners-up (deliberately excluded)

- **School Spirit chrome (mascot/colors)** — pure cosmetics, no mechanic; great _polish_ if time remains after #1–#3. (Guardrail: any school color/mascot Tailwind classes must be full static strings in a `SCHOOLS` map, never interpolated, or JIT purge drops them — see `frontend-conventions`.)
- **School directory `/school/[name]`** — near-free `WHERE school=$1` variant of the directory query; the obvious next step once #1 ships and a natural mount for the #3 head-to-head line.
- **Rivalry Wall** — redundant with Taunt as the cross-school interaction (both critics: pick one). Cut in favor of Taunt.
- **School Pride Leaderboard** — only maybe-rated; leans gamification, thin on seed data; #3 is the cheaper consequential stat.
- **Wall-to-Wall thread** — strong effort/authenticity (zero new schema, read-only over `wall_posts`), but doesn't advance the rivalry/relationship narrative; best low-cost bonus if time remains.
- **Favorites panel / structured Courses / Friends-graph / Top 8 / Gifts / Away Message / Profile views** — cut for bulk busywork, data migration, dual-graph debt, MySpace-era or post-2004 anachronism, or redundancy with chosen features.

---

## Guardrails (per `CLAUDE.md`)

- **Raw `pg` only**, no ORM. New schema lands **only** in the idempotent `src/app/api/migrate/route.ts` block (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`); apply post-deploy via `curl -X POST ".../api/migrate?token=$NEXTAUTH_SECRET"` (remember the secret's trailing newline, URL-encoded — per project memory).
- **Mutations are Server Actions returning `{ error?: string }`, never throw** (except `redirect()`, which lives outside try/catch). Client components surface the error inline and only reset on success.
- **One DB pool** — import `query` from `src/lib/db.ts`; never `new Pool()`.
- **No `any`** — all new shapes in `src/lib/types.ts`. **Tailwind only**, no inline `style`; reuse `fieldClass`/`buttonClass` from `src/lib/ui.ts`.
- **Keep extractable logic pure** in `src/lib/` (e.g. `schools.ts` validation, looking-for/interested-in whitelists) so the Vitest QA gate can cover it — the pre-push `qa-runner` will add tests and block on `npm test` / `tsc --noEmit` failure.
- **Self-action guards:** taunt/relationship actions must no-op or reject self-targeting, mirroring poke/follow.
