# SML Social Network

## Project Overview

A minimal social network (Facebook 2004 era) built for a timed technical interview. Core features: user sign-up, user profiles, post status updates, and a feed of posts from followed/all users.

**Interview constraints:** Core MVP in 60 min on Cloud Run. Features complete by 90 min. Stretch goals (follows, likes, comments) in remaining time.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Cloud SQL — PostgreSQL 15 |
| DB client | `pg` (node-postgres) with raw SQL — no ORM |
| Auth | NextAuth.js v5 (credentials provider) — JWT sessions |
| Compute | Cloud Run (containerized via Dockerfile) |
| Container registry | Artifact Registry (`us-central1`) |
| Secrets | Secret Manager (DB URL, NextAuth secret) |
| GCP project | `sml-interview-sandbox` |
| Region | `us-central1` |

## GCP Resource Names (all prefixed `mdjamal-`)

- Cloud Run service: `mdjamal-app`
- Cloud SQL instance: `mdjamal-db`
- Artifact Registry repo: `mdjamal-registry`
- Secret Manager secrets: `mdjamal-db-url`, `mdjamal-nextauth-secret`

## File Structure

```
src/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
    (main)/
      feed/page.tsx
      profile/[username]/page.tsx
    api/
      auth/[...nextauth]/route.ts
      posts/route.ts          # GET /api/posts, POST /api/posts
      users/[id]/route.ts
    layout.tsx
    page.tsx                  # redirect → /feed
  components/
    PostCard.tsx
    PostForm.tsx
    UserAvatar.tsx
  lib/
    db.ts                     # Pool singleton (reads DATABASE_URL from env)
    auth.ts                   # NextAuth config
    types.ts
  middleware.ts               # Protect (main) routes
```

## Coding Standards

- **No ORM.** Use raw SQL via `pg`. The authoritative schema is the inlined `SCHEMA` string in `src/app/api/migrate/route.ts` (idempotent, applied via the migrate route); `schema.sql` at root is a stale reference copy.
- **Server Actions** for mutations (post creation, profile update). Route Handlers for read APIs.
- **Mutations return `{ error?: string }`, they don't throw** (except `redirect()`). Client components surface the error inline and only reset/clear on success. See `register` and `createPost`. The one exception: `redirect()` must throw, so call it after the try/catch.
- **One DB pool.** `src/lib/db.ts` exports a single `Pool` — never instantiate `Pool` elsewhere.
- **Env vars only through `process.env`.** Never import dotenv in production code — Next.js handles it.
- **Error handling:** always return typed error responses `{ error: string }` with correct HTTP status.
- **Tailwind only** for styling — no inline `style={}` props.
- **No `any` types.** Define types in `src/lib/types.ts`.

## Database Schema

Authoritative schema is the `SCHEMA` string in `src/app/api/migrate/route.ts` (idempotent:
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), applied post-deploy
via `curl -X POST ".../api/migrate?token=$NEXTAUTH_SECRET"`. Current tables:

- **users** — `id, username, email, password_hash, bio, created_at` plus added columns:
  `relationship_status, interests, courses, school, interested_in, looking_for, avatar (BYTEA), avatar_mime`
- **posts** — `id, user_id→users, content (≤280), created_at`
- **comments** — `id, post_id→posts, user_id→users, content (≤280), created_at`
- **wall_posts** — `id, owner_id→users, author_id→users, content (≤280), created_at` (author posts on owner's wall)
- **follows** — PK `(follower_id, following_id)`, one-directional
- **likes** — PK `(user_id, post_id)`
- **pokes** — PK `(poker_id, pokee_id)`, `acknowledged` — contentless ping
- **taunts** — PK `(taunter_id, tauntee_id)`, `acknowledged` — Poke variant, **only between users at *different* schools** (rival-school guard in `taunt()`)
- **relationships** — PK `(requester_id, addressee_id)`, `status`, `confirmed` — mutually-confirmed linked partner (the free-text `users.relationship_status` still holds *solo* statuses)

**`school` is required at registration** and validated against the `SCHOOLS` const in `src/lib/schools.ts`.
Avatars are stored as `bytea` in `users` and served by `GET /api/avatar/[id]` (uploaded image or initials-SVG fallback).

## Environment Variables

These are **never in the repo**. Set in Secret Manager and wired to Cloud Run.

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@/dbname?host=/cloudsql/...` (Unix socket) |
| `NEXTAUTH_SECRET` | Random 32-byte secret |
| `NEXTAUTH_URL` | Full public HTTPS URL of the Cloud Run service |

## Gotchas (learned the hard way)

- **`db.ts` must lazy-init the Pool.** The `DATABASE_URL` check and `new Pool()` happen on first `query()` call, NOT at module import. A module-level throw fails `next build`, which imports route modules without a live DB.
- **Schema is applied via `/api/migrate`, not a local `psql`.** The Cloud SQL instance is private-IP only (org policy blocks public IP), so it's unreachable from a laptop. The migrate route inlines the core SQL (the standalone Docker bundle doesn't ship root files like `schema.sql`, so a disk read would break in prod). Hit it once post-deploy from inside the VPC: `curl -X POST "https://<url>/api/migrate?token=$NEXTAUTH_SECRET"`.
- **NextAuth v5 needs a split config.** `auth.config.ts` is edge-safe (callbacks, session strategy, `authorized` route-protection logic) and is the ONLY thing `middleware.ts` imports — it must never pull in `pg` or `bcrypt`, which can't run on the edge runtime. The pg/bcrypt-backed `authorize` lives only in `auth.ts`. If the middleware bundle balloons or build complains about Node APIs at the edge, something Node-only leaked into `auth.config.ts`.
- **`authorize()` returns `null` on failure, never throws.** Throwing yields a 500 instead of a graceful "invalid credentials". Login form calls `signIn(..., { redirect: false })` and handles the error in the UI.
- **`redirect()` must live outside try/catch.** Next's `redirect()` works by throwing — a surrounding catch swallows it. Same applies to server actions (see register action).
- **`secret`/`trustHost` set explicitly in config.** v5 defaults to `AUTH_SECRET`, but our Secret Manager value mounts as `NEXTAUTH_SECRET`, so `auth.config.ts` passes `secret: process.env.NEXTAUTH_SECRET` and `trustHost: true` (required behind Cloud Run's proxy).

## Testing & the QA Gate

- **Test runner:** Vitest. Run with `npm test` (`vitest run`) or `npm run test:watch`. Tests live next to the code as `src/**/*.test.ts`.
- **What we test:** pure logic only — validation/formatting helpers in `src/lib/` (e.g. `validation.ts`, `time.ts`). Do **not** unit-test React components, server actions that hit the DB/auth, or anything needing live Postgres — there's no DB locally. Keep extractable logic as pure functions in `src/lib/` so it stays testable.
- **Automated QA gate on push:** `.git/hooks/pre-push` runs before every `git push` from *any* session. It invokes the `qa-runner` subagent (`.claude/agents/qa-runner.md`) headless, which adds tests for new pure logic, runs `npm test` + `npx tsc --noEmit`, and prints `QA_VERDICT: PASS`/`FAIL`. **A FAIL blocks the push.**
  - Bypass for a trivial/docs-only change: `git push --no-verify`.
  - The hook lives in `.git/hooks/` (not version-controlled) — it's local to this clone. Re-create it after a fresh clone if needed.
  - Last run is logged to `.claude/.qa-last-run.log`.

## Never Do This

- **No secrets in the repo.** The repo is public. Use Secret Manager. `.env*` is in `.gitignore`.
- **No service account key files in the repo.** `*.json` (except package files) is in `.gitignore`.
- **GCP only.** No Vercel, Netlify, Render, AWS, or Azure.
- **No separate backend.** Everything runs inside the Next.js app — no Express, Fastify, or separate API service.
- **No Firestore.** This project uses Cloud SQL (PostgreSQL) exclusively.
- **No ORM.** No Prisma, Drizzle, TypeORM. Raw `pg` only.
- **No `npm audit fix --force`.** It breaks peer dependencies silently.
- **No `process.env` without fallback validation** at startup — crash loudly if `DATABASE_URL` is missing.
