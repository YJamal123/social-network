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

## Never Do This

- **No secrets in the repo.** The repo is public. Use Secret Manager. `.env*` is in `.gitignore`.
- **No service account key files in the repo.** `*.json` (except package files) is in `.gitignore`.
- **GCP only.** No Vercel, Netlify, Render, AWS, or Azure.
- **No separate backend.** Everything runs inside the Next.js app — no Express, Fastify, or separate API service.
- **No Firestore.** This project uses Cloud SQL (PostgreSQL) exclusively.
- **No ORM.** No Prisma, Drizzle, TypeORM. Raw `pg` only.
- **No `npm audit fix --force`.** It breaks peer dependencies silently.
- **No `process.env` without fallback validation** at startup — crash loudly if `DATABASE_URL` is missing.
