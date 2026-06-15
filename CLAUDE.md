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
| Auth | NextAuth.js v5 (credentials provider) — sessions in DB |
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

- **No ORM.** Use raw SQL via `pg`. Schema lives in `schema.sql` at project root.
- **Server Actions** for mutations (post creation, profile update). Route Handlers for read APIs.
- **One DB pool.** `src/lib/db.ts` exports a single `Pool` — never instantiate `Pool` elsewhere.
- **Env vars only through `process.env`.** Never import dotenv in production code — Next.js handles it.
- **Error handling:** always return typed error responses `{ error: string }` with correct HTTP status.
- **Tailwind only** for styling — no inline `style={}` props.
- **No `any` types.** Define types in `src/lib/types.ts`.

## Database Schema (`schema.sql`)

```sql
-- Run once on Cloud SQL instance before first deploy
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  bio         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) <= 280),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Stretch goal tables (add if time permits)
CREATE TABLE follows (
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE likes (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id   UUID REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);
```

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

## Never Do This

- **No secrets in the repo.** The repo is public. Use Secret Manager. `.env*` is in `.gitignore`.
- **No service account key files in the repo.** `*.json` (except package files) is in `.gitignore`.
- **GCP only.** No Vercel, Netlify, Render, AWS, or Azure.
- **No separate backend.** Everything runs inside the Next.js app — no Express, Fastify, or separate API service.
- **No Firestore.** This project uses Cloud SQL (PostgreSQL) exclusively.
- **No ORM.** No Prisma, Drizzle, TypeORM. Raw `pg` only.
- **No `npm audit fix --force`.** It breaks peer dependencies silently.
- **No `process.env` without fallback validation** at startup — crash loudly if `DATABASE_URL` is missing.
