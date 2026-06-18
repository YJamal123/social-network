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
| DB client | Prisma ORM (typed client for mutations; `prisma.$queryRaw` for the complex reads) |
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
    db.ts                     # PrismaClient singleton (lazy getPrisma()/prisma, reads DATABASE_URL from env)
    auth.ts                   # NextAuth config
    types.ts
  middleware.ts               # Protect (main) routes
```

## Coding Standards

- **Prisma ORM.** The authoritative data model is `prisma/schema.prisma`; migrations live in `prisma/migrations/` and are applied with `prisma migrate deploy` run by a **Cloud Run Job inside the VPC** (Cloud SQL is private-IP only). Use the typed Prisma client for mutations (upserts/creates/deletes); the few expressive reads (`fetchPosts`, the directory search, the profile/conversation aggregates) MAY stay `prisma.$queryRaw` (still goes through the Prisma engine — no `pg` Pool). The old `/api/migrate` SCHEMA string has been retired. `schema.sql` at root was deleted (it was stale).
- **Server Actions** for mutations (post creation, profile update). Route Handlers for read APIs.
- **Mutations return `{ error?: string }`, they don't throw** (except `redirect()`). Client components surface the error inline and only reset/clear on success. See `register` and `createPost`. The one exception: `redirect()` must throw, so call it after the try/catch.
- **One DB client.** `src/lib/db.ts` exports a single lazy `PrismaClient` (via `getPrisma()` / the `prisma` proxy) — never instantiate `PrismaClient` (or a `pg` Pool) elsewhere.
- **Env vars only through `process.env`.** Never import dotenv in production code — Next.js handles it.
- **Error handling:** always return typed error responses `{ error: string }` with correct HTTP status.
- **Tailwind only** for styling — no inline `style={}` props.
- **No `any` types.** Define types in `src/lib/types.ts`.

## Database Schema

Authoritative schema is `prisma/schema.prisma` (models + native `@db.*` types + composite
`@@id`s + named relations). Migrations are version-controlled under `prisma/migrations/` and
applied with `prisma migrate deploy` run by the **`mdjamal-migrate` Cloud Run Job** inside the
VPC (Cloud SQL is private-IP only). The first migration `0_init` was **baselined**
(`prisma migrate resolve --applied 0_init`) against the existing prod DB so it was marked
applied without re-running DDL — demo data untouched. `CHECK` constraints (Prisma can't model
them) are hand-appended as raw SQL inside `0_init/migration.sql`. Current tables:

- **users** — `id, username, email, password_hash, bio, created_at` plus added columns:
  `relationship_status, interests, courses, school, interested_in, looking_for, avatar (BYTEA), avatar_mime, class_year`
  plus Auth0 columns (`20260618000000_auth0_columns`): `auth0_sub (unique, nullable)` — the
  OIDC join key — and `onboarded_at (nullable)` — gates the one-time `/onboarding` step.
  `username` and `password_hash` are now **nullable** (an Auth0-provisioned row has no username
  until onboarding and no bcrypt hash at all; the UNIQUE-on-username constraint stays, NULLs
  are distinct in Postgres).
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
| `AUTH0_CLIENT_ID` | Auth0 Regular Web App client id (`mdjamal-auth0-client-id`) |
| `AUTH0_CLIENT_SECRET` | Auth0 client secret (`mdjamal-auth0-client-secret`) — **no trailing newline** or OIDC token exchange fails `invalid_client` |
| `AUTH0_ISSUER` | `https://<tenant>.<region>.auth0.com` (`mdjamal-auth0-issuer`) — the NextAuth Auth0 `issuer` |

## Gotchas (learned the hard way)

- **`db.ts` must lazy-init the PrismaClient.** The `DATABASE_URL` check happens in `getPrisma()` on first use, NOT at module import. `new PrismaClient()` does not connect at construction (it connects on first query), but importing `@prisma/client` requires the generated client to exist — so `prisma generate` must run before `tsc` and `next build`. A module-level throw would fail `next build`, which imports route modules without a live DB.
- **`prisma generate` must run before `tsc`/`next build`.** CI runs `npx tsc --noEmit` right after `npm ci`; without a generated client `@prisma/client` exports no model types and `tsc` fails. The `"postinstall": "prisma generate"` script (runs at the end of every `npm ci`) and `"build": "prisma generate && next build"` cover this. `postinstall` requires `prisma/schema.prisma` to exist — keep it committed.
- **Prisma engine on Alpine/musl.** The runtime image is `node:20-alpine` (musl + OpenSSL 3), so `schema.prisma` sets `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`. The standalone Next bundle can drop the native engine binary, so `next.config.mjs` adds `experimental.outputFileTracingIncludes` for `node_modules/.prisma/client/*` AND the Dockerfile runner stage `COPY`s `node_modules/.prisma` + `@prisma/client`. If you see "Query engine binary for current platform could not be found" at runtime, this is why.
- **Schema is applied by the `mdjamal-migrate` Cloud Run Job, not a local `psql` or `/api/migrate`.** Cloud SQL is private-IP only (org policy blocks public IP), unreachable from a laptop. The Job runs `prisma migrate deploy` inside the VPC with the Cloud SQL instance attached (`--add-cloudsql-instances`) and its runtime SA holding `roles/cloudsql.client`. `migrate deploy` is idempotent (skips applied migrations) and takes a Postgres advisory lock for the duration. Run it post-deploy: `gcloud run jobs execute mdjamal-migrate --wait --region=us-central1 --project=sml-interview-sandbox`. `/api/seed` is still an HTTP token-guarded route (now using Prisma).
- **NextAuth v5 needs a split config.** `auth.config.ts` is edge-safe (callbacks, session strategy, `authorized` route-protection logic) and is the ONLY thing `middleware.ts` imports — it must never pull in Prisma (`@prisma/client`) or `bcrypt`, which can't run on the edge runtime. The Prisma/bcrypt-backed `authorize`, the **Auth0 OIDC provider**, and the DB-touching **Node `jwt` callback** live only in `auth.ts`. If the middleware bundle balloons or build complains about Node APIs at the edge, something Node-only leaked into `auth.config.ts`.
- **Two auth providers, one identity.** `auth.ts` runs **Auth0 (OIDC)** + the legacy **Credentials (bcrypt)** provider; both resolve to the same `users.id`. The Node `jwt` callback (a) race-safe `upsert`s by `auth0_sub` on first Auth0 login, (b) does `email_verified`-gated link-by-email adoption of a legacy row, (c) **overwrites `token.name` with the DB `username`** (NOT the OIDC display name — every ownership/`revalidatePath` check depends on `session.user.name === username`), and (d) sets `token.onboarded`. The edge `authorized` callback routes logged-in-but-not-onboarded users to `/onboarding` using only `token.onboarded` (no DB). Onboarding is OUTSIDE `(main)` with a scoped `SessionProvider`; its action returns `{ok:true}` (not a redirect) so the client calls `useSession().update()` to refresh the JWT before navigating — otherwise the stale `onboarded=false` loops back. New Auth0 secrets: `AUTH0_CLIENT_ID/SECRET/ISSUER` (issuer = `https://<domain>`, no trailing newline); wire via `--update-secrets`, grant the runtime SA `secretAccessor`.
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
- **Prisma is the ORM — do not add a second one.** No Drizzle, TypeORM, etc., and do not reintroduce a raw `pg` Pool. (`prisma.$queryRaw` for expressive reads is fine — it runs through the Prisma engine.)
- **No `npm audit fix --force`.** It breaks peer dependencies silently.
- **No `process.env` without fallback validation** at startup — crash loudly if `DATABASE_URL` is missing.
