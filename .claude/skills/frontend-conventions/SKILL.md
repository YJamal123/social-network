---
name: frontend-conventions
description: Use when building or refactoring UI in this Next.js app (components in src/components, pages under src/app/(main), Tailwind/tokens in tailwind.config.ts + globals.css). Covers component decomposition/reuse (Avatar, UserRow, buttons), design-token discipline (no one-off arbitrary values), server/client boundaries, and Tailwind class hygiene. Triggers on any frontend/styling/refactor task here.
---

# Frontend conventions (SML social network)

Concrete, codebase-specific rules for keeping the UI clean. Read this before touching
anything under `src/components/` or `src/app/(main)/`. Respects CLAUDE.md (raw `pg` SQL,
Server Actions return `{ error? }`, no `any`, Tailwind only, types in `src/lib/types.ts`).

## The design system (where things live)

- **Tokens:** `tailwind.config.ts` — colors (`primary`, `periwinkle`, `coral`, `surface-*`,
  `outline`, `outline-variant`, `on-*`), the dense `fontSize` scale (`body-sm`, `body-base`,
  `label-bold`, `section-header`, `action-link`, `masthead-logo`), and spacing
  (`gutter`, `panel-padding`, `stack-sm/md/lg`), `maxWidth.container-max` (960px).
- **Base styles:** `src/app/globals.css` — `.bracket-link` (the `[ … ]` action pattern),
  `.material-symbols-outlined` sizing, scrollbar. No dark mode (intentional — it broke form inputs).
- **Layout primitive:** `src/components/Panel.tsx` — white surface + hairline border + shadow,
  periwinkle header bar, optional bracketed `action`. **Use `<Panel>` for every titled card.**
  Don't hand-roll `border border-outline-variant bg-surface-container-lowest shadow-sm` with a
  header — that's a Panel.

## Golden rules

1. **Use the type scale, never arbitrary font sizes.** `text-[10px]` is a smell — we have
   `body-sm` (11px) and `action-link` (11px). There is no 10px in the scale; if a true 10px
   micro-label is genuinely needed, **add a token** (e.g. `caption: ["10px", …]`) rather than
   sprinkling `text-[10px]`. Current offenders to fix when you touch them: `Stat` and the Wall
   timestamp in `profile/[username]/page.tsx`, and the result-count `action` spans in
   `directory/page.tsx` and `pokes/page.tsx`.
2. **No one-off arbitrary spacing/sizing.** `min-w-[1.1rem]` (SiteHeader poke badge),
   `min-h-[60px]` (WallComposer), `w-28` (header search) should map to named spacing tokens or
   shared primitives. Promote a value to the scale once it appears twice.
3. **Tailwind only.** No `style={}`. Theme via the tokens above, not raw hex.
4. **No `any`.** Component props get an inline type or a type from `src/lib/types.ts`. Row shapes
   that come from a SQL query (e.g. `DirectoryRow`) belong in `src/lib/types.ts`, not inlined in
   the page.
5. **Server by default; `"use client"` only for interactivity.** Pages and read-only display
   components stay server components (they call `query()`/`auth()` directly). Only components with
   `useState`/`useTransition`/`onClick` get `"use client"` — that's exactly the button/composer set
   (`LikeButton`, `FollowButton`, `PokeButton`, `PokeBackButton`, `WallComposer`, `PostForm`,
   `CommentSection`, `DirectorySearch`). Don't push `"use client"` up into a page.

## Missing primitives to introduce (highest-value cleanup)

The same markup is copy-pasted across pages. Extract these into `src/components/` as **server**
components and replace the inline copies.

### `<Avatar>` — the initial-letter tile
Currently duplicated **5 ways with 5 sizes and inconsistent borders/radii**:
- `PostCard.tsx`: `h-12 w-12 … rounded border-2 border-primary bg-primary-container text-lg`
- `profile/[username]/page.tsx` left rail: `aspect-square … text-6xl border-2 border-primary`
- `directory/page.tsx`: `h-16 w-16 … rounded border border-outline-variant bg-primary-container text-2xl`
- `pokes/page.tsx`: `h-10 w-10 … rounded border border-primary bg-primary-container text-base`

Make one primitive with a `size` prop on a fixed scale, so border, radius, bg, and font are
consistent:

```tsx
// src/components/Avatar.tsx  (server component, no "use client")
const SIZES = {
  sm: "h-10 w-10 text-base",
  md: "h-12 w-12 text-lg",
  lg: "h-16 w-16 text-2xl",
  xl: "aspect-square w-full text-6xl",
} as const

export function Avatar({ username, size = "md" }: { username: string; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded border-2 border-primary bg-primary-container font-bold text-white ${SIZES[size]}`}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  )
}
```
Wrap in a `<Link>` at the call site when it should navigate (PostCard, pokes) — keep the link
concern out of the avatar. This is also where a real avatar image would later slot in once.

### `<UserRow>` — avatar + name link + subtitle + trailing action
`directory/page.tsx` and `pokes/page.tsx` render the same row independently (avatar, name `<Link>`,
a muted subtitle line, and a right-aligned action button). Extract a `<UserRow>` taking
`username`, `subtitle`, and an `action?: ReactNode` slot for the `FollowButton`/`PokeBackButton`.
Reuse `<Avatar size="sm">` inside it.

### `<UserNameTime>` — the "name link + relative time" header
Repeated in `PostCard.tsx`, the Wall list in `profile/[username]/page.tsx`, and the comment header
in `CommentSection.tsx`. Same shape every time:
```
<Link className="text-label-bold text-primary hover:underline">{username}</Link>
<span className="shrink-0 text-body-sm text-outline">{timeAgo(created_at)}</span>
```
(Note the Wall currently uses `text-[10px]` here — collapsing into the shared component fixes that
inconsistency for free.)

### Button variants
Three buttons share an **identical** className string:
`shrink-0 rounded border border-primary px-3 py-1 text-label-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-50`
— `FollowButton` (the "Following" state), `PokeButton`, `PokeBackButton`. And the *primary* fill
(`rounded bg-primary px-3 py-1 text-label-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50`)
is repeated in `PostForm`, `WallComposer`, `CommentSection`, and the feed search button.

Define the two class strings once (a `buttonClass` map in a small `src/lib/ui.ts`, or a tiny
`<Button variant="primary|outline">` if you want a component). Keep the existing optimistic
`useState`/`useTransition` logic in each interactive button — only the className is shared. Don't
over-abstract the behavior; these are deliberately separate client components.

## Eliminating duplicated query/markup (server side)

- **Post-with-engagement subquery is copy-pasted.** `getPosts` in `feed/page.tsx` and
  `getUserPosts` in `profile/[username]/page.tsx` share the identical `like_count` / `liked_by_me`
  / `comment_count` correlated-subquery block. Extract a single SQL helper (e.g.
  `src/lib/queries.ts` exporting `postSelectFields` or a `fetchPosts({ where })`) returning
  `PostWithAuthor[]`. Still raw `pg` via the one `query()` from `src/lib/db.ts` — no ORM.
- **Empty-state block is duplicated.** "No posts yet…" centered panels appear in feed, profile
  posts, the Wall, directory, and pokes with slightly different markup. A small `<EmptyState
  icon? message />` (the `material-symbols-outlined` + muted text pattern) removes the drift.

## Tailwind class hygiene

- **Order classes consistently:** layout/box (`flex`, `grid`, `h-`, `w-`) → spacing (`p-`, `gap-`,
  `m-`) → border/radius → background → typography → color → state (`hover:`, `disabled:`,
  `focus:`). Makes diffs and duplication obvious.
- **Conditional classes:** keep the existing template-literal pattern (see `LikeButton`,
  `FollowButton`). Fine for 1–2 branches; if it grows, lift the variant strings into the shared
  button map above rather than nesting ternaries in JSX.
- **Repeated input styling:** the textarea/input class
  (`w-full resize-none rounded border border-outline-variant bg-white p-2 … focus:border-primary focus:outline-none`)
  recurs in `PostForm`, `WallComposer`, `CommentSection`. Consider a shared `inputClass` constant.

## Pre-flight checklist (run mentally before finishing UI work)

- [ ] No new `text-[…]`, `min-w-[…]`, `min-h-[…]`, raw hex, or `style={}` — used tokens instead.
- [ ] Any titled card uses `<Panel>`; any initial-tile uses `<Avatar>` (once it exists).
- [ ] Didn't re-paste an avatar/user-row/name-time/button block that already has (or warrants) a primitive.
- [ ] New component is a server component unless it needs interactivity; `"use client"` not leaked into a page.
- [ ] Query shapes typed in `src/lib/types.ts`; no `any`.
- [ ] Mutations are Server Actions returning `{ error? }` (don't throw except `redirect()`); reads are server components / route handlers.
- [ ] One `Pool` only — query through `query()` from `src/lib/db.ts`.
- [ ] `npx tsc --noEmit` clean (the pre-push QA gate will enforce this anyway).
