RALPH COMPLETE

# Roadmap Progress — Phases 2–6 (cleaner UI + code quality)

Derived from `.claude/IMPROVEMENT-ROADMAP.md`. Phase 1 is already done. Each
iteration: do the FIRST unchecked task, consult the relevant SKILL.md, verify
(`tsc` + `build`), commit, tick it. When all are checked, make `RALPH COMPLETE`
the exact first line of this file and commit.

## Phase 2 — Shared visual primitives (Avatar, Button, field, focus)
- [x] 1. Create `src/components/Avatar.tsx` (server component) — initial-letter tile with a `size` prop (`sm`/`md`/`lg`/`xl`), modernized (rounded-full or rounded-lg, drop the heavy 2px navy border). Replace the 4 inline copies in `PostCard.tsx`, `profile/[username]/page.tsx` (left-rail tile), `directory/page.tsx`, `pokes/page.tsx`. Wrap in `<Link>` at the call site (keep linking out of Avatar).
- [x] 2. Create `src/lib/ui.ts` exporting a `buttonClass` map (`primary`/`outline`/`ghost`) and a shared `fieldClass`. Hovers use real color shifts (not opacity); every variant includes a visible `focus-visible:ring-2 focus-visible:ring-secondary-container focus-visible:outline-none`. (No JSX here — class strings only.)
- [x] 3. Replace the outline-button className in `FollowButton.tsx`, `PokeButton.tsx`, `PokeBackButton.tsx` with `buttonClass.outline` (keep each component's own state/transition logic).
- [x] 4. Replace the primary-fill button className in `PostForm.tsx`, `WallComposer.tsx`, `CommentSection.tsx`, the feed Quick Search button (`feed/page.tsx`), and login/register with `buttonClass.primary`.
- [x] 5. Replace the duplicated input/textarea className in `PostForm.tsx`, `WallComposer.tsx`, `CommentSection.tsx`, `ProfileEditForm.tsx`, login/register, and `DirectorySearch.tsx` with the shared `fieldClass` (which adds the focus ring).
- [x] 6. Fix `SiteHeader.tsx` search focus (currently `focus:ring-0`) and optionally add an `@layer base` rule in `globals.css` giving `input, textarea` a guaranteed focus ring.

## Phase 3 — Resilience: loading, error, not-found
- [x] 7. Add co-located `loading.tsx` skeletons mirroring each page's grid (reuse the exact grid classes to avoid layout shift): `feed/loading.tsx`, `profile/[username]/loading.tsx`, `directory/loading.tsx`, `pokes/loading.tsx`. Use `animate-pulse` blocks with token colors.
- [x] 8. Add `src/app/(main)/error.tsx` — a Client Component (`"use client"`) taking `{ error, reset }`, rendered as a styled `<Panel>` + `error-container` banner with a "Try again" button calling `reset()`.
- [x] 9. Add `src/app/not-found.tsx` — an on-brand 404 (so `profile/[username]`'s `notFound()` renders nicely).

## Phase 4 — Interaction + accessibility completeness
- [x] 10. `PokeButton.tsx` and `PokeBackButton.tsx`: surface `result.error` inline (`text-error`) instead of silently ignoring it (optionally optimistic with revert, matching `LikeButton.tsx`).
- [x] 11. Add accessible names / live regions: poke badge in `SiteHeader.tsx` gets `aria-label` + `aria-live="polite"`; the header search and feed Quick Search inputs get `aria-label`.
- [x] 12. Add a mobile nav fallback to `SiteHeader.tsx` (the nav is `hidden md:flex`, so directory/pokes/profile/logout are unreachable on mobile) — a `md:hidden` menu or second link row.
- [x] 13. Raise contrast: body/meta text that must be read (e.g. comment/Wall timestamps doubling as meta) moves from `text-outline` to `text-on-surface-variant`; reserve `text-outline` for de-emphasized meta only.

## Phase 5 — Composite primitives + token cleanup
- [x] 14. Create `src/components/EmptyState.tsx` (icon + muted message, the directory pattern) and adopt it for the feed, profile posts, the Wall, and pokes empty states.
- [x] 15. Create `src/components/UserRow.tsx` (Avatar `sm` + name `<Link>` + muted subtitle + trailing `action?: ReactNode`) and use it in `directory/page.tsx` and `pokes/page.tsx`.
- [x] 16. Create `src/components/UserNameTime.tsx` (name link + `timeAgo`) and use it in `PostCard.tsx`, the Wall list in `profile/[username]/page.tsx`, and `CommentSection.tsx`.
- [x] 17. Retire arbitrary values using tokens (`text-[10px]` → `caption`; `min-w-[1.1rem]`, `min-h-[60px]`, `w-28` → named spacing tokens added to config). Bump primary content cards (PostCard, profile Information/Wall) toward `p-4`, and widen the feed two-column gap slightly. Confirm coral is only on like/poke.

## Phase 6 — Server-side dedupe (no visual change)
- [x] 18. Create `src/lib/queries.ts` with a shared post-with-engagement helper (returns `PostWithAuthor[]`); replace the identical `like_count`/`liked_by_me`/`comment_count` subquery block in `getPosts` (`feed/page.tsx`) and `getUserPosts` (`profile/[username]/page.tsx`) — they differ only in WHERE. Raw `pg` via `query()` only, no ORM.
- [x] 19. Move the inline `DirectoryRow` type from `directory/page.tsx` into `src/lib/types.ts`.

## Wrap-up
- [x] 20. Final pass: `npx tsc --noEmit` + `npm run build` clean; self-review all changes against the three skills and the roadmap guardrails; confirm coral is only on like/poke and no `"use client"` leaked into a page; then mark complete.
