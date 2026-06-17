# SML Improvement Roadmap

A single, prioritized, phased plan to make SML look **cleaner and more modern** and
to raise **code quality**, synthesized from three research skills:
- `.claude/skills/ui-design-polish/SKILL.md` (visual design)
- `.claude/skills/ux-interaction-states/SKILL.md` (UX / interaction / a11y)
- `.claude/skills/frontend-conventions/SKILL.md` (architecture / token hygiene)

## Vision

SML is a faithful 2004-Facebook clone whose biggest weakness is **visual loudness**:
nearly every surface stacks three separation signals at once (1px border + soft shadow +
a solid periwinkle header bar), corners are sharp, type is uniformly tiny (11–13px with no
heading step), and navy/periwinkle/coral are used as *structure* rather than *meaning*.
Underneath the reskin, the same markup is copy-pasted everywhere — the initial-letter avatar
exists in 5 inconsistent forms, two buttons classes are re-declared 3–6 times, and the
post-with-engagement SQL is duplicated between feed and profile.

The target is a refined, contemporary feel that **keeps the institutional-navy character**:
**fewer simultaneous separators per surface, more whitespace, a clear type hierarchy, softer
rounded corners, color reserved for meaning (coral only for like/poke), and shared primitives**
(`Avatar`, `Button`, `field`, `UserRow`, `EmptyState`) so a restyle is a one-file edit.

Phases are ordered by **impact-per-effort** and are each **independently shippable and
build-gated** (`npx tsc --noEmit` + `next build` clean; the pre-push QA gate enforces this).
Earlier phases deliberately land the shared primitives so later phases are cheap.

---

## Phase 1 — Panel + type + tokens (the cascade)

**Goal:** One high-leverage edit set that reskins every screen at once: calm the `<Panel>`
chrome, give the app a real title step, and add the radius/caption tokens later phases rely on.

- [ ] In `tailwind.config.ts`, add a `borderRadius.DEFAULT` (~6px) **or** plan to use
      `rounded-lg`; add a `title-lg` fontSize token (e.g. `18px/600` or `20px/700`); add a
      `caption` token (`10px`) so `text-[10px]` can be retired.
- [ ] Refactor `src/components/Panel.tsx` to use **one** separation signal: white card with
      soft shadow and `rounded-lg`, **no** border (or a near-invisible `border-outline-variant/40`).
- [ ] Demote the periwinkle header bar in `Panel.tsx` to an in-card header: dark text
      (`text-on-surface`), `text-section-header`, on white, with a thin `border-b
      border-outline-variant/60` (optionally a small periwinkle left-accent rule to keep character).
      Confirm the `action` slot (bracketed `edit` links) still reads — the white-text `action` in
      `profile/[username]/page.tsx` Information panel must switch to `text-primary`.
- [ ] Replace the hand-rolled panel chrome in `profile/[username]/page.tsx` (the avatar card at
      ~line 108 and the stats header at ~line 148, both `border border-outline-variant
      bg-surface-container-lowest ... shadow-sm`) with `<Panel>` or the new shared card class.
- [ ] Use `title-lg` for the profile name (`profile/[username]/page.tsx` h1 currently ad-hoc
      `text-2xl`) and add a real page title to the feed (`feed/page.tsx` has none).
- [ ] Verify `PostCard.tsx`'s outer `<article>` (which re-implements panel chrome inline at line 11)
      matches the new Panel treatment (border-or-shadow, `rounded-lg`).

## Phase 2 — Shared visual primitives (Avatar, Button, field, focus)

**Goal:** Extract the most-duplicated, most-inconsistent elements into single sources of truth,
and fix the accessibility focus gap in the same pass.

- [ ] Create `src/components/Avatar.tsx` (server component, no `"use client"`) with a `size` prop
      on a fixed scale (`sm`/`md`/`lg`/`xl`). Modernize the tile: `rounded-full` (or `rounded-lg`),
      drop the heavy `border-2 border-primary` in favor of the fill alone or `ring-1 ring-black/5`.
      Replace the 4 inline copies: `PostCard.tsx` (h-12), `profile/[username]/page.tsx` left rail
      (text-6xl square), `directory/page.tsx` (h-16), `pokes/page.tsx` (h-10). Wrap in `<Link>` at
      the call site — keep the link concern out of the avatar.
- [ ] Create `src/lib/ui.ts` exporting shared class strings (a `buttonClass` map: `primary` /
      `outline` / `ghost`, and a shared `fieldClass`). Hovers use real color shifts, not opacity
      (`primary → hover:bg-primary-container`). Every variant includes a visible focus ring:
      `focus-visible:ring-2 focus-visible:ring-secondary-container focus-visible:outline-none`.
- [ ] Replace the byte-identical outline button className in `FollowButton.tsx`, `PokeButton.tsx`,
      `PokeBackButton.tsx` with `buttonClass.outline` (keep each component's own
      `useState`/`useTransition` logic — share only the className).
- [ ] Replace the primary-fill button class in `PostForm.tsx`, `WallComposer.tsx`,
      `CommentSection.tsx`, the feed Quick Search button, and login/register with `buttonClass.primary`.
- [ ] Replace the duplicated textarea/input class in `PostForm.tsx`, `WallComposer.tsx`,
      `CommentSection.tsx`, `ProfileEditForm.tsx`, login/register, and `DirectorySearch` with the
      shared `fieldClass`, which adds `focus-visible:ring-2 focus-visible:ring-secondary-container`.
- [ ] Fix the worst focus offender: `SiteHeader.tsx` search uses `focus:outline-none focus:ring-0`
      (no indicator) — give it a visible focus state. Optionally add an `@layer base` rule in
      `src/app/globals.css` for `input, textarea` so the ring is guaranteed app-wide.

## Phase 3 — Resilience: loading, error, not-found (highest UX priority)

**Goal:** No more blank screens on cold Cloud Run + Cloud SQL, and no unstyled Next overlays.

- [ ] Add co-located `loading.tsx` skeletons that mirror each page's grid (reuse the exact grid
      classes to avoid layout shift): `feed/loading.tsx`, `profile/[username]/loading.tsx`,
      `directory/loading.tsx`, `pokes/loading.tsx`. Skeleton block pattern:
      `<div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />` (tokens only).
- [ ] Add `src/app/(main)/error.tsx` (or per-route): a **Client Component** (`"use client"`)
      accepting `{ error, reset }`, rendered as a styled `<Panel>` + `error-container` banner with a
      "Try again" button calling `reset()`.
- [ ] Add `src/app/not-found.tsx` so `profile/[username]/page.tsx`'s existing `notFound()` renders
      an on-brand 404 instead of the default Next page.

## Phase 4 — Interaction + accessibility completeness

**Goal:** Close the remaining interaction gaps so every control behaves and announces correctly.

- [ ] `PokeButton.tsx` and `PokeBackButton.tsx` currently set success only on `!result.error` and
      **never surface `result.error`** (duplicate poke / network failure silently does nothing).
      Render the error inline like other components (`text-error`), and optionally flip optimistically
      with revert-on-error to match `LikeButton.tsx`.
- [ ] Add accessible names / live regions to icon- and number-only controls: the coral poke badge in
      `SiteHeader.tsx` needs `aria-label={`${pokeCount} new pokes`}` + `aria-live="polite"`; the
      header search and feed Quick Search inputs need `aria-label="Search people"`.
- [ ] Add a **mobile navigation fallback** to `SiteHeader.tsx`: the nav is `hidden ... md:flex`, so
      on mobile only the logo + search are reachable (no directory/pokes/profile/logout). Add a
      `md:hidden` menu or a second link row.
- [ ] Raise contrast of readable body text currently in `text-outline` (~4.0:1): use
      `text-on-surface-variant` (#444650) or darker for content users must read (e.g. comment/Wall
      timestamps that double as meta), reserving `text-outline` for de-emphasized meta only.

## Phase 5 — Composite primitives + token cleanup

**Goal:** Remove the remaining structural duplication and retire arbitrary values.

- [ ] Extract `src/components/EmptyState.tsx` (icon + muted message, the directory pattern) and
      adopt it everywhere empties differ today: feed (bordered box), profile posts, the Wall, pokes.
- [ ] Extract `src/components/UserRow.tsx` (Avatar `sm` + name `<Link>` + muted subtitle + trailing
      `action?: ReactNode`) and use it in `directory/page.tsx` and `pokes/page.tsx` so the two list
      pages are identical by construction.
- [ ] Extract `src/components/UserNameTime.tsx` (name link + `timeAgo`) used in `PostCard.tsx`, the
      Wall list in `profile/[username]/page.tsx`, and `CommentSection.tsx`. This also fixes the Wall's
      `text-[10px]` drift for free.
- [ ] Retire arbitrary values using the Phase 1 tokens: `text-[10px]` in `Stat` and the Wall
      timestamp (`profile/[username]/page.tsx`) and the result-count spans in `directory/page.tsx` /
      `pokes/page.tsx` → `caption`; `min-w-[1.1rem]` (SiteHeader badge), `min-h-[60px]`
      (WallComposer), `w-28` (header search) → named spacing tokens.
- [ ] Tame color usage now that primitives exist: confirm coral appears **only** on like/poke, and
      let neutral surfaces + whitespace + hairline dividers (the directory's `gap-px bg-outline-variant`
      pattern) do separation work rather than colored fills.
- [ ] Bump spacing rhythm on primary content cards (PostCard, profile Information/Wall) toward 16px
      padding (`p-4`) while keeping list rows compact, and widen the feed two-column `gap-gutter`
      slightly (20–24px) for a calmer layout.

## Phase 6 — Server-side dedupe (code quality, no visual change)

**Goal:** One source of truth for shared queries and types; no behavior change.

- [ ] Create `src/lib/queries.ts` exporting a shared post-with-engagement helper (e.g.
      `fetchPosts({ where })` or a `postSelectFields` block) returning `PostWithAuthor[]`. Replace the
      identical `like_count` / `liked_by_me` / `comment_count` correlated-subquery block in `getPosts`
      (`feed/page.tsx`) and `getUserPosts` (`profile/[username]/page.tsx`), which differ only in WHERE.
      Still raw `pg` via the single `query()` from `src/lib/db.ts` — **no ORM**.
- [ ] Move the inline `DirectoryRow` query shape from `directory/page.tsx` into `src/lib/types.ts`.
- [ ] Keep any newly-extractable pure logic (formatting/validation) as pure functions in `src/lib/`
      so the QA gate can unit-test them (per CLAUDE.md testing rules).

---

## Non-goals / guardrails

- **Respect CLAUDE.md absolutely.** Raw `pg` SQL only — no ORM, no Prisma/Drizzle. Mutations are
  Server Actions returning `{ error? }` and **don't throw** (except `redirect()`). One `Pool` only,
  via `query()` in `src/lib/db.ts`. Reads stay server components / route handlers.
- **Tailwind only.** No inline `style={}`, no raw hex in components. New design constants go in
  `tailwind.config.ts` (extend) or `globals.css` `@layer`.
- **No `any`.** All types live in `src/lib/types.ts`.
- **Behavior stays intact.** This is a visual + structural refactor: don't change auth, the feed's
  follow-filter logic, like/follow/poke semantics, or DB schema. Extractions must be byte-equivalent
  in behavior (e.g. the shared SQL helper produces the same columns/order).
- **Don't break the edge boundary.** `auth.config.ts` / `middleware.ts` must never pull in `pg` or
  `bcrypt`. New shared modules (`src/lib/ui.ts`, `src/lib/queries.ts`) must not leak into the edge bundle.
- **Server/client discipline.** New display primitives (`Avatar`, `UserRow`, `UserNameTime`,
  `EmptyState`) are **server** components; `"use client"` stays only on the interactive set and is
  never pushed up into a page.
- **Keep identity touches that still read well:** the `[ sml ]` bracket wordmark, dot-separated nav,
  `.bracket-link` actions, the coral poke badge.
- **Don't spread coral** beyond the like/poke meaning.
- **Each phase is build-gated:** `npx tsc --noEmit` + `next build` clean before shipping; the
  pre-push `qa-runner` gate enforces tests + tsc on push.
