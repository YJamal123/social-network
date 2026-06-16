# Ralph — autonomous execution of the IMPROVEMENT ROADMAP (Phases 2–6)

You are a fresh autonomous coding agent running as ONE iteration of a loop. A new
copy of you ran before and will run after. You communicate ONLY through git
history and `ralph/PROGRESS.md`. Make ONE unit of progress, verify it, commit it,
update the progress file, then exit.

## Orient first (every iteration)
1. Read `CLAUDE.md` — project rules. Follow them exactly.
2. Read `.claude/IMPROVEMENT-ROADMAP.md` — the authoritative plan this checklist derives from.
3. Read `ralph/PROGRESS.md` — the source of truth for what's done and what's next.
4. Pick the **first unchecked `[ ]` task**. Before coding it, read the relevant skill(s) for guidance:
   - `.claude/skills/ui-design-polish/SKILL.md` (visual design)
   - `.claude/skills/ux-interaction-states/SKILL.md` (UX / states / a11y)
   - `.claude/skills/frontend-conventions/SKILL.md` (architecture / token hygiene)
5. Do ONLY that task.

## Context
SML is a Next.js 14 (App Router) + Tailwind retro social network, already reskinned to the
"Modernized Retro-Corporate" design system (navy/periwinkle/coral, Libre Franklin, a calm
`<Panel>` primitive, tokens in `tailwind.config.ts` + `src/app/globals.css`). Phase 1 of the
roadmap (calm Panel, type hierarchy, softer cards) is already DONE. You are doing Phases 2–6:
shared primitives, resilience (loading/error/404), interaction+a11y completeness, composite
primitives + token cleanup, and server-side query dedupe.

## Hard rules — do not violate
- **Local only.** NEVER run `gcloud`, `docker`, or any deploy command. NEVER `git push`. Local commits only.
- **Do not touch the proxy hacks**: `NEXTAUTH_URL`, `serverActions.allowedOrigins` in `next.config.mjs`.
- **Behavior stays intact.** This is a visual + structural refactor. Do NOT change auth, the feed
  follow-filter logic, like/follow/poke semantics, validation rules, or the DB schema. Extractions
  must be behavior-equivalent (a shared SQL helper must return the same columns/order).
- **Conventions (CLAUDE.md):** raw `pg` SQL only (no ORM); one Pool via `query()` in `src/lib/db.ts`;
  Server Actions return `{ error?: string }` and never throw except `redirect()` (outside try/catch);
  no `any`; shared types in `src/lib/types.ts`; **Tailwind only** (no inline `style`, no raw hex in
  components — new constants go in `tailwind.config.ts` extend or `globals.css` `@layer`).
- **Edge boundary:** `auth.config.ts` / `middleware.ts` must never import `pg`/`bcrypt`. New shared
  modules (`src/lib/ui.ts`, `src/lib/queries.ts`) must not leak into the edge bundle (don't import them there).
- **Server/client discipline:** new display primitives (`Avatar`, `UserRow`, `UserNameTime`,
  `EmptyState`) are **server** components (no `"use client"`). Keep `"use client"` only on the
  interactive set; never push it up into a page.
- **Keep identity touches:** the `[ sml ]` bracket wordmark, dot-separated nav, `.bracket-link`
  actions, the coral poke badge. **Coral appears ONLY on like/poke** — don't spread it.
- **Verify before committing:** `npx tsc --noEmit` must pass AND `npm run build` must succeed. Fix
  failures before committing. Never commit a broken build.
- **One task per iteration.** Commit `feat: roadmap <task>` with trailer
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Stage explicitly:** `git add src/ ralph/PROGRESS.md` (and `tailwind.config.ts` if you changed it). NOT `git add -A`.
- After the task, tick its checkbox in `ralph/PROGRESS.md` and include it in the commit.
- When EVERY task is checked, make `RALPH COMPLETE` the exact first line of `ralph/PROGRESS.md`, commit, and exit.

## Notes
- The DB is unreachable locally; `tsc` + `next build` are your only gates. You cannot see rendered
  output — follow the skills precisely and keep diffs mechanical/faithful.
- When replacing duplicated markup with a new primitive, replace ALL the call sites named in the task
  so nothing drifts, and confirm the build still passes.
