---
name: ui-design-polish
description: Make the SML social-network UI cleaner, calmer, and more modern. Use when adding or restyling any React component or page in src/components/ or src/app/(main|auth)/, touching tailwind.config.ts/globals.css tokens, reviewing visual design, or asked to improve spacing, type, color, panels, avatars, or hover/focus states.
---

# UI Design Polish — SML

How to evolve this app from a faithful 2004-Facebook clone toward a refined, contemporary look **without losing its institutional-navy character**. Tasteful departure is encouraged. Everything here is grounded in the real components.

## Non-negotiables (from CLAUDE.md — never violate)
- **Tailwind only.** No inline `style={}`. New design constants go in `tailwind.config.ts` (extend) or `globals.css` `@layer`.
- **No `any`.** Types in `src/lib/types.ts`.
- **Reuse `<Panel>`** (`src/components/Panel.tsx`) — it's the layout atom. Don't hand-roll its border/header/shadow inline (the profile page does this in 3 places — see "Consistency" below).
- Don't touch server actions / SQL while doing visual work.

## The tokens you have (use them; don't hardcode hex)
`tailwind.config.ts` defines: `primary #21417f`, `primary-container #3b5998`, `secondary #475e8c`, `periwinkle #6d84b4`, `coral #e0506d`, a neutral `surface*` ramp (`surface-container-lowest` = white up to `surface-container-highest`), `outline #747781`, `outline-variant #c4c6d2`, `error`/`error-container`. Spacing aliases: `gutter 16px`, `panel-padding 12px`, `stack-sm/md/lg` (4/8/16). Type scale: `body-sm 11px`, `body-base 13px`, `label-bold 12px`, `section-header 12px/700`, `action-link 11px`, `masthead-logo 20px`. Container: `max-w-container-max` = 960px.

## The core problem to fix
The current UI is **visually loud and dense**: every container has a 1px hairline border **and** a shadow, the periwinkle header bar sits on every panel, type is uniformly tiny (11–13px), corners are sharp (`rounded` = 4px, often omitted), and accent colors appear everywhere. Modern/clean means **fewer simultaneous separation signals, more whitespace, a clearer hierarchy, and color reserved for meaning**. Pick ONE separation method per surface — not border + shadow + colored header all at once.

---

## The highest-leverage moves (in priority order)

### 1. Soften & unify the panel — pick one separation signal
`Panel.tsx` today: `border border-outline-variant bg-surface-container-lowest shadow-sm` + a **solid periwinkle header bar** with white bold text. That's three separators stacked. Modern direction:
- **Drop the border OR the shadow**, not both. Cleanest: white card, `rounded-lg`, soft shadow, **no border** (or a near-invisible `border-outline-variant/40`).
- **Demote the periwinkle bar.** Replace the full-bleed colored header with a plain header *inside* the card: dark text (`text-on-surface`), `text-section-header`, on white, with a thin `border-b border-outline-variant/60`. Keep periwinkle only as a small left accent rule or an underline if you want to retain character. Colored header bars on *every* panel are the single most dated signal.
- Bump radius globally: add `borderRadius.DEFAULT` ~`6px` in config, or switch panels to `rounded-lg`. Sharp 0/4px corners read as 2004.
- This is the biggest win because `<Panel>` is everywhere — one edit reskins feed, profile, directory, pokes, forms.

### 2. Establish a real type hierarchy
Everything is 11–13px, so nothing stands out. A page needs a clear top note. Add a heading step to the scale (e.g. `title-lg: 18px/600` or `20px/700`) and use it for page/section titles (profile username currently uses ad-hoc `text-2xl`; the feed has no page title). Keep body at 13px but let headings breathe. Tighten the reliance on `font-bold` everywhere — modern hierarchy comes from **size + weight + color contrast**, not bold-on-everything.

### 3. Increase spacing rhythm / reduce density
`panel-padding` is 12px and stacks are tight. Calm UIs use more air:
- Card padding 16px (`p-4`) for primary content surfaces; keep 12px for compact list rows.
- The feed left rail nav rows (`feed/page.tsx` `NavItem`) and list rows are fine dense, but content cards (PostCard, profile Information/Wall) should get more vertical breathing room (`gap-4`+).
- Keep the 960px grid, but the feed's `gap-gutter` (16px) between rail and content can go to 20–24px for a less cramped two-column feel.

### 4. Modernize the avatar tile
Initial-letter tiles use `rounded border-2 border-primary bg-primary-container` (PostCard h-12, profile text-6xl square, directory h-16 `rounded border`). Issues: heavy 2px navy ring + sharp-ish corners read dated, and sizes/borders are inconsistent across screens.
- Switch to **`rounded-full`** (or `rounded-lg` if you want to keep a hint of the square tile) and **drop the 2px border** in favor of the fill alone, or a subtle `ring-1 ring-black/5`.
- Standardize: one avatar treatment, parameterized by size. Strongly consider extracting a `<UserAvatar username size>` component (CLAUDE.md's file structure already anticipates `UserAvatar.tsx`) so PostCard, profile, directory, and pokes stop each rolling their own tile. **High consistency payoff.**

### 5. Tame the color — neutrals carry structure, accents carry meaning
Navy/periwinkle/coral currently appear as structure (panel headers, avatar rings, every link). Modern rule:
- **Navy/periwinkle = brand chrome** (masthead, primary buttons, key links). Stop using periwinkle as a per-panel header background (see #1).
- **Coral = a true accent**, reserved for one thing: the liked state + poke indicator. It already is — keep it scarce; don't spread it to other CTAs.
- Let **neutral surfaces + whitespace** do separation work instead of colored fills. The directory's `gap-px bg-outline-variant` grid (hairline dividers between cells) is a nice tonal-separation example — prefer that pattern over boxing every item.

### 6. Consistent, visible focus & hover states
- Inputs use `focus:border-primary focus:outline-none` — removing the outline without a replacement hurts a11y. Add a ring: `focus-visible:ring-2 focus-visible:ring-primary/40` (and keep `focus:outline-none`). Apply to every `<input>/<textarea>/<button>`. The shared input class lives inline in `PostForm`, `WallComposer`, `ProfileEditForm` (`fieldClass`), login — **extract one shared field class** so focus styling is uniform.
- Buttons mix `hover:opacity-90` (primary) and `hover:bg-surface-container` (outline). Prefer real color shifts over opacity: primary → `hover:bg-primary-container`, which the Stitch ref actually uses. Opacity hovers look cheap and dim text too.
- Links: `hover:underline` is consistent and fine; keep it.

### 7. Buttons: one shared set of variants
Primary buttons are re-declared ~6 times (`bg-primary px-... py-... text-label-bold text-on-primary ...`) with slightly different padding (`px-6`/`px-4`/`px-3`). Extract `primary`/`outline`/`ghost` button classes (a `buttonClass` helper in `src/lib/` returning a string, or a small `<Button>` component) so padding, radius, hover, and disabled states match everywhere. Reduces drift; makes future restyles one-line.

### 8. Empty states & micro-polish
Empty states are inconsistent: feed uses a bordered box, profile/pokes use centered text, directory/pokes use a Material icon + label. Standardize on the **icon + muted label** pattern (directory's is the best) for all empties. Small thing, but it makes the app feel coherent screen-to-screen.

---

## Do / Don't

**Do**
- Edit `Panel.tsx` once to cascade panel changes everywhere.
- Reach for `surface-container*` neutrals + spacing before adding another border or colored fill.
- Keep `rounded-lg` and shadow choices consistent across PostCard, Panel, and the inline cards on the profile page.
- Preserve identity touches that still read well: the `[ sml ]` bracket wordmark, dot-separated nav, `bracket-link` actions, coral poke badge.
- Add new shared classes/tokens in config or `globals.css @layer`, then reference them.

**Don't**
- Don't stack border + shadow + colored header on the same surface.
- Don't introduce `style={}`, hardcoded hex, or `any`.
- Don't spread coral beyond like/poke.
- Don't `focus:outline-none` without adding a visible `focus-visible:ring`.
- Don't keep hand-rolling avatars/buttons/inputs inline — extract and reuse.

## Consistency hit-list (concrete duplications to collapse)
- **Panel chrome re-implemented inline** on the profile page (`profile/[username]/page.tsx`): the avatar tile wrapper, the stats header, all use `border border-outline-variant bg-surface-container-lowest ... shadow-sm` instead of `<Panel>`. Convert to `<Panel>` or a shared card class.
- **Avatar tile**: PostCard / profile / directory / pokes each duplicate it at different sizes — extract `UserAvatar`.
- **Primary button**: PostForm, WallComposer, CommentSection, ProfileEditForm, login, feed Quick Search — extract a variant.
- **Input/textarea field class**: same string repeated 5+ places — extract once, add focus ring there.

## Quick pre-ship checklist
- [ ] Each surface uses ONE separation signal (border *or* shadow *or* tonal fill), not all three.
- [ ] Corners are `rounded-lg` (or your chosen DEFAULT), consistent across cards.
- [ ] There's a clear largest-text element per page (a real title).
- [ ] Coral appears only on like/poke.
- [ ] Every focusable element has a visible focus ring.
- [ ] Avatars and primary buttons come from one shared treatment.
- [ ] New colors/sizes are tokens in `tailwind.config.ts`, not inline hex.
- [ ] No `style={}`, no `any`; `<Panel>` reused; types in `src/lib/types.ts`.
