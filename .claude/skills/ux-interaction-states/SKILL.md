---
name: ux-interaction-states
description: Use when building or reviewing any UI in this Next.js app — pages, forms, buttons, lists, or async/Server-Action flows. Covers loading/empty/error/skeleton states, optimistic updates, form feedback & validation, focus rings, aria, keyboard, contrast, and responsiveness of the 960px grid. Trigger on words like loading, empty, error, skeleton, spinner, optimistic, focus, aria, accessible, disabled, validation, responsive, mobile.
---

# UX & Interaction States — SML Social Network

This app is a Next.js 14 App-Router social network reskinned to a "Modern Retro-Corporate" system: navy `primary` (#21417f) masthead, `periwinkle` (#6d84b4) panel headers, `coral` (#e0506d) accent, Libre Franklin, a fixed `max-w-container-max` (960px) grid, the shared `<Panel>` primitive, and initial-tile avatars. Tokens live in `tailwind.config.ts`; base styles in `src/app/globals.css`. **All styling is Tailwind utilities only — no inline `style={}`** (CLAUDE.md rule). Use the design tokens, never raw hex.

Use this skill to make interactions feel complete and accessible. Below is what's already good, the concrete gaps in the live screens, and patterns to copy.

## How this app already handles state (match these conventions)

- **Optimistic mutations** flip local state first, then revert on `result.error`. See `src/components/LikeButton.tsx` and `FollowButton.tsx` — copy this shape for any new toggle.
- **Pending UI** uses `useTransition` + `disabled={pending}` + `disabled:opacity-50`, and swaps button label to a `…`-suffixed gerund ("Posting…", "Logging in…"). See `PostForm.tsx`, `CommentSection.tsx`, `WallComposer.tsx`.
- **Mutations return `{ error?: string }`, never throw** (CLAUDE.md). Client surfaces it inline: `{error && <p className="text-body-sm text-error">…</p>}`. For Server Actions wired with `useFormState`, errors render in an `error-container` banner: `<p className="rounded bg-error-container p-2 text-body-sm text-error">` (see `register/page.tsx`, `ProfileEditForm.tsx`).
- **Empty states** exist on every list: feed, profile posts, The Wall, directory (icon + message + "clear search"), pokes (icon + message). Match this — never render a bare empty `<div>`.
- **Char counters** turn `text-error` near the limit (`PostForm`: `content.length > MAX - 20`).
- **Submit disabled when empty**: `disabled={pending || content.trim().length === 0}`.

## The biggest gaps (audited in the live screens)

### 1. No route-level loading or error UI — HIGHEST PRIORITY
There are **zero** `loading.tsx`, `error.tsx`, or `not-found.tsx` files anywhere under `src/app/`. Every page (`feed`, `profile/[username]`, `directory`, `pokes`) is an `async` Server Component doing multiple sequential DB `query()` calls (profile page does 4: profile, isFollowing, posts, wall). On a cold Cloud Run instance + Cloud SQL socket, that's a blank screen with no feedback, and any thrown DB error becomes an unstyled Next error overlay.

**Fix:** add co-located `loading.tsx` skeletons and `error.tsx` boundaries.
- `src/app/(main)/feed/loading.tsx`, `.../profile/[username]/loading.tsx`, `.../directory/loading.tsx`, `.../pokes/loading.tsx` — render the page's grid shell with `<Panel>` headers intact and skeleton blocks in the body.
- An `error.tsx` per `(main)` route group (or one at `(main)/error.tsx`) — must be a Client Component (`"use client"`), accept `{ error, reset }`, and render a styled Panel with a "Try again" button calling `reset()`.

Skeleton block pattern (tokens only, no new colors):
```tsx
<div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />
```
Build a feed skeleton by reusing the real grid classes from `feed/page.tsx` (`mx-auto grid max-w-container-max grid-cols-1 gap-gutter px-gutter py-stack-lg md:grid-cols-12`) so layout doesn't shift when content arrives.

`profile/[username]/page.tsx` already calls `notFound()` — add `src/app/not-found.tsx` (or a route-local one) so it renders something on-brand instead of the default Next 404.

### 2. Focus rings are removed without a visible replacement — ACCESSIBILITY
Inputs use `focus:border-primary focus:outline-none` (see `PostForm`, `WallComposer`, `CommentSection`, login/register/profile-edit inputs, `DirectorySearch`). A 1px border-color change is a weak focus indicator and fails keyboard users; the SiteHeader search input is worse — `focus:outline-none focus:ring-0` removes it entirely. The Stitch refs actually use `focus:ring-primary-container` — adopt that.

**Fix:** keep `focus:outline-none` only if you add a ring, e.g. append `focus:ring-2 focus:ring-secondary-container` (or `focus:ring-primary-container`) to inputs/textareas. Apply to **buttons too** — none of the buttons (`LikeButton`, `FollowButton`, `PokeButton`, Post/Comment/Search submits) have any visible focus style; add `focus-visible:ring-2 focus-visible:ring-secondary-container focus-visible:outline-none`. Prefer `focus-visible:` for buttons so mouse clicks don't show the ring. Because there are many inputs, consider a base style in `globals.css` `@layer base` for `input, textarea { @apply ... }` rather than editing each call site.

### 3. Icon-only / ambiguous controls lack accessible names — ACCESSIBILITY
- The poke badge in `SiteHeader.tsx` shows a bare number on coral with no text alternative — add `aria-label={`${pokeCount} new pokes`}` and ideally `aria-live="polite"` so it announces.
- The SiteHeader search has an icon and a placeholder but no `<label>`/`aria-label` on the input. Same for the feed sidebar "Quick Search". Add `aria-label="Search people"`.
- Avatar tiles are decorative initials inside links whose text is elsewhere — fine, but if an avatar link has no adjacent text (none currently), give it an `aria-label`.
- `LikeButton` is good (`aria-pressed`); `CommentSection` toggle is good (`aria-expanded`). Keep that bar for new toggles.

### 4. Pokes have weak / non-reverting feedback — INTERACTION
`PokeButton.tsx` and `PokeBackButton.tsx` only set `poked`/`done` to `true` on success and never surface an error if `result.error` is set (e.g. duplicate poke, network failure) — the click silently does nothing. Unlike `LikeButton`, there's no optimistic flip and no error path.

**Fix:** on `result.error`, show an inline message or a brief toast, and don't leave the button looking inert. At minimum render the error like the other components do. Consider optimistic "Poked!" with revert-on-error to match `LikeButton`.

### 5. CommentSection re-fetches the whole thread after posting — INTERACTION
After `addComment` succeeds it calls `await loadComments()` (full round trip) instead of optimistically appending the new comment. It also has no empty-input inline hint and resets `count` from the server. It's correct but feels laggy. Optionally append optimistically (push a temp comment, bump `count`) then reconcile. Lower priority than 1–4.

### 6. Responsiveness of the fixed grid — MOBILE
The 960px container is fine, but check these:
- `feed/page.tsx` grid is `grid-cols-1 ... md:grid-cols-12` — good, sidebar stacks on mobile.
- `SiteHeader.tsx` hides the entire nav under `md:flex` (`hidden ... md:flex`) — **on mobile there is no navigation at all** except the logo and search. There's no hamburger/menu fallback, so mobile users can't reach directory/pokes/profile/logout. Add a mobile menu (even a simple second row of links shown `md:hidden`).
- The SiteHeader search input is a fixed `w-28` — verify it doesn't crowd the logo on the smallest widths.
- `profile/[username]/page.tsx` left rail is `md:w-52` and stacks above content on mobile — good. The stats row (`Stat` ×3 with dividers) can get tight; confirm it wraps or shrinks on narrow screens.

## Checklist for any new screen / component

- [ ] Loading: route has a `loading.tsx` skeleton that mirrors the real layout (no CLS).
- [ ] Error: route group has an `error.tsx` (Client Component, `reset()` button), styled with `<Panel>` + `error-container`.
- [ ] Empty: every list renders an explicit empty state (icon + message), matching directory/pokes.
- [ ] Pending: async buttons use `useTransition`, `disabled={pending}`, `disabled:opacity-50`, and a "…"-label.
- [ ] Optimistic: toggles flip locally and **revert on `result.error`** (copy `LikeButton`).
- [ ] Errors surfaced: every mutation that can return `{ error }` renders it inline (`text-error` or `error-container` banner) — never swallow it (audit `PokeButton`/`PokeBackButton`).
- [ ] Focus: inputs AND buttons have a visible focus ring (`focus-visible:ring-2 focus-visible:ring-secondary-container`); never `outline-none` alone.
- [ ] Names: icon-only/number-only controls have `aria-label`; toggles have `aria-pressed`/`aria-expanded`; live regions (`aria-live="polite"`) for counts that change (poke badge).
- [ ] Keyboard: every interactive element is a real `<button>`/`<a>`/`<Link>` (already true) and reachable via Tab; test the full poke/like/comment flow with keyboard.
- [ ] Contrast: don't put body text in `text-outline` (#747781 on white ≈ 4.0:1 — borderline for small text). Use `text-on-surface-variant` (#444650) or darker for anything users must read; reserve `outline` for de-emphasized meta only.
- [ ] Mobile: layout collapses to one column; navigation is reachable (SiteHeader currently hides nav on mobile — fix or provide a menu).

## Do / Don't (this codebase)

- DO reuse `<Panel>` for any new card/section; pass `bodyClassName=""` when you need flush list rows (see directory/pokes).
- DO keep extractable validation/formatting as pure functions in `src/lib/` so the QA gate can unit-test them (CLAUDE.md testing rule). State logic in components is fine but pull pure helpers out.
- DON'T add new colors — use tokens (`coral`, `error`, `error-container`, `surface-container`, `secondary-container`, etc.).
- DON'T use inline styles or `any`. Types go in `src/lib/types.ts`.
- DON'T remove a focus outline without adding a ring.
- DON'T make a Server Action throw for user errors — return `{ error }` and render it.
