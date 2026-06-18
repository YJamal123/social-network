# Prisma ORM Migration — Independent Verification Report

**Verifier:** VERIFY-ORM (adversarial, read-only audit)
**Date:** 2026-06-18
**Branch:** `feat/v2-prisma-auth0` (HEAD `5e685dc`)
**Live URL:** https://mdjamal-app-ttc7jxtqgq-uc.a.run.app
**Project/region/service:** `sml-interview-sandbox` / `us-central1` / `mdjamal-app`

## VERDICT: **PASS**

The Prisma ORM migration is complete, correct, and not broken. Every claim in
`prisma-impl-progress.md` was independently confirmed against the repo and live prod.
All three gates pass (tsc clean, 64/64 tests, DB-less build exits 0). No raw `pg`
remains. Edge-safety holds. The migrate Cloud Run Job exists with the correct IAM and
a clean execution history. Live prod serves health + a real credentials login resolving
the demo user's `users.id` — demo data is intact **without re-seeding** (stronger than
the progress doc, which only asserted it).

Two non-blocking notes (both already flagged by the impl agent, neither a defect):
the live revision is `00027-58z` (the later Auth0 deploy), not the Prisma doc's
`00026-q56`; and `connection_limit=5` is still not pinned on the secret. Details below.

---

## Checklist with evidence

### 1. No raw `pg` remains — PASS
- `grep -rn "from 'pg'|new Pool|getPool|\.query(" src/` → only matches are **comments**
  in `src/lib/db.ts:3` ("Mirrors the old pg-Pool contract"). Zero `.query(` call sites.
- `package.json`: no `"pg"` / `"@types/pg"` dependency. `@prisma/client ^6.19.3` (dep),
  `prisma ^6.19.3` (devDep) present (`package.json:17,32`).
- No `new Pool` / `getPool` / `import ... 'pg'` anywhere in `src/`.
- **Result:** `pg` fully removed; nothing imports it.

### 2. Prisma client correct & singleton — PASS
- `src/lib/db.ts:18-42`: lazy `getPrisma()` does the `DATABASE_URL` check + constructs the
  client on first call (not at import); `globalThis.__prisma__` cache for dev hot-reload;
  a `prisma` Proxy defers construction to first property access.
- `grep "new PrismaClient" src/` → exactly one real construction site (`db.ts:29`); the
  other hit (`db.ts:9`) is a comment. No other file constructs a client.
- **No default export** (`grep "export default" src/lib/db.ts` → none) — the old
  `import getPool from "@/lib/db"` seed path is gone.
- Lazy-init preserves DB-less `next build` (verified in #4).
- 16 files import `@/lib/db` (the 14 from the doc plus `onboarding/actions.ts`, an Auth0
  file — all use `getPrisma()`/`prisma`).

### 3. Edge-safety holds — PASS
- `src/lib/auth.config.ts` imports only `import type { NextAuthConfig } from "next-auth"`
  (`:1`). No `@prisma/client` / `getPrisma` / `@/lib/db` / `pg` / `bcrypt`.
- `src/middleware.ts` imports only `next-auth` + `@/lib/auth.config` (`:1-2`).
- `grep -nE "prisma|bcrypt|@/lib/db|getPrisma|'pg'"` over both → only a **comment** in
  `auth.config.ts:4`. Edge boundary clean.

### 4. Build / type / test gates — PASS
| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **clean, exit 0** |
| Tests | `npm test` (vitest run) | **64/64 pass**, 7 files |
| DB-less build | `env -u DATABASE_URL npm run build` | **exit 0**, 17/17 static pages, full route table emitted |
| Offline generate | `npx prisma generate` | exit 0, "Generated Prisma Client (v6.19.3)" in 133ms, no network |
| Schema validate | `npx prisma validate` | "schema is valid 🚀" |

- `package.json:12` `"postinstall": "prisma generate"` and `:7`
  `"build": "prisma generate && next build"` both present.
- The generated client + the `darwin-arm64` engine exist in
  `node_modules/.prisma/client/`; the Prisma CLI is at `node_modules/.bin/prisma`.
- **Note on the build log:** during the DB-less build, Next prerenders `/api/health`,
  which calls the DB; with `DATABASE_URL` unset Prisma throws and Next logs the error —
  but treats it as a non-fatal dynamic-route prerender error and **the build completes
  (exit 0)**. This is the intended lazy-init behavior (no module-level throw); not a defect.

### 5. Schema & migrations — PASS
- `prisma/migrations/` contains `0_init/` (baselined), `20260618000000_auth0_columns/`,
  and `migration_lock.toml`.
- **`0_init/migration.sql`:** `CREATE EXTENSION IF NOT EXISTS pgcrypto` (`:7`), 11
  `CREATE TABLE`s (users, posts, follows, likes, comments, wall_posts, pokes, taunts,
  relationships, friendships, messages), and 6 hand-appended CHECK constraints
  (`:242-247`): 4× `char_length(content) <= 280` (posts/comments/wall_posts/messages) +
  2× self-reference `<>` (friendships, messages). Matches the plan exactly.
- **`20260618000000_auth0_columns/migration.sql` is additive / non-destructive** —
  the entire migration is:
  ```sql
  ALTER TABLE "users" ADD COLUMN "auth0_sub" TEXT,
  ADD COLUMN "onboarded_at" TIMESTAMPTZ(6),
  ALTER COLUMN "username" DROP NOT NULL,
  ALTER COLUMN "password_hash" DROP NOT NULL;
  CREATE UNIQUE INDEX "users_auth0_sub_key" ON "users"("auth0_sub");
  ```
  No DROP COLUMN, no DROP TABLE, no data loss. DROP NOT NULL only relaxes. The UNIQUE
  index on a nullable column is correct (Postgres treats NULLs as distinct).
- **`binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`** (`schema.prisma:18`) —
  correct musl target for the `node:20-alpine` runtime.
- **Dockerfile** ships the engine: runner stage copies `node_modules/.prisma` +
  `@prisma/client` (`Dockerfile:53-54`); a dedicated `migrate` stage (`:28-37`) keeps full
  `node_modules` + `prisma/` and `CMD ["npx","prisma","migrate","deploy"]`.
- **`next.config.mjs`** merges `experimental.outputFileTracingIncludes` for
  `.prisma/client/*.node` + `schema.prisma` **without touching** `serverActions`. Good.

### 6. Live prod state (read-only) — PASS
- `GET /api/health` → `{"ok":true}` (Prisma client + musl engine + DB all live).
- `GET /login` → HTTP 200; `GET /` → 307 → `/login?callbackUrl=...` (middleware works).
- Service traffic: **`mdjamal-app-00027-58z` at 100%** (= `status.latestReadyRevisionName`).
- **Migrate Job `mdjamal-migrate`** exists; runtime SA
  `110062063496-compute@developer.gserviceaccount.com`; image
  `mdjamal-migrate:auth0-20260618150247`. Last 3 executions all **succeeded** (succeeded=1,
  failed=blank).
- Job SA project IAM includes **`roles/cloudsql.client`** and
  `roles/secretmanager.secretAccessor`.
- **Demo data intact (proven, not asserted):** read-only credentials login
  (`POST /api/auth/callback/credentials`, csrf-token flow) for
  `thefacebook_tom@demo.sml` / `demo1234` → **302** + session
  `{"user":{"name":"thefacebook_tom","id":"2a3bbbb8-33f7-436e-9581-fe6851ca8eb2","onboarded":true}}`.
  This exercises `prisma.user.findUnique` by email + bcrypt verify through the Prisma
  engine and confirms the demo row exists in the live DB **without re-seeding**.

### 7. Half-ported / risky — PASS (none found)
- **uuid casts:** every `$queryRaw`/`$queryRawUnsafe` that compares a uuid column to a
  string param casts `::uuid` — `queries.ts:35`, `feed/actions.ts:112`,
  `messages/actions.ts:80,83,97,145,146`, `pokes/actions.ts:134`,
  `taunts/actions.ts:153`, `friends/actions.ts:165,177,180`,
  `profile/actions.ts:306,352`, `profile/[username]/page.tsx:44,48,49,79,82,112`,
  `directory/page.tsx:23`. Bare comparisons (`u.id = p.user_id` etc.) are uuid-to-uuid
  column joins that correctly need no cast. No `operator does not exist: uuid = text`
  hazard found.
- **Seed transaction:** `getPrisma().$transaction(...)` with
  `tx.user.deleteMany({ where: { email: { endsWith: "@demo.sml" } } })`
  (`seed/route.ts:679,683-684`); no `getPool`/`BEGIN`/`COMMIT`. Demo users stamped
  `onboardedAt: new Date()` (`:704`).
- **register P2002:** `err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"`
  (`register/actions.ts:52-53`) — pg `23505` correctly translated.
- **No secrets committed:** `.env` is gitignored and untracked; no `.env*` tracked.

---

## Discrepancies between the progress doc and reality

All minor / explanatory — none is a defect:

1. **Live revision is `00027-58z`, not `00026-q56`.** The progress doc was written after
   the Prisma deploy (`00026-q56`); the later Auth0 deploy bumped prod to `00027-58z`
   (consistent with `STATE.md`). The Prisma migration is live under the current revision.
2. **Migrate Job image is the Auth0 image** (`auth0-20260618150247`) and its recent
   executions correspond to applying `auth0_columns`. The Prisma `0_init` baseline +
   deploy described in the doc happened earlier; the Job mechanism itself is unchanged
   and working.
3. **17th `@/lib/db` importer:** `src/app/onboarding/actions.ts` (an Auth0 file) also uses
   Prisma — additive to the doc's "16 files", not a regression.
4. **Local `prisma validate`/`generate` load a gitignored `.env`** ("Environment variables
   loaded from .env"). Expected per the handoff notes; `.env` is gitignored and untracked.

## Prioritized issues to fix (DO NOT FIX — report only)

- **[LOW] `connection_limit=5` not pinned** on the `mdjamal-db-url` secret. Prisma's
  default (`num_cpus*2+1`) per warm Cloud Run instance can pressure Cloud SQL
  `max_connections` under scale-out. Recommendation (already in the impl doc's deferred
  list): append `&connection_limit=5` to the secret + redeploy; confirm `max_connections`
  headroom. No code change. Severity LOW because current traffic is light and health is green.
- **[INFO] Branch unpushed.** `feat/v2-prisma-auth0` is local-only; CD (`deploy.yml`)
  hasn't run the migrate Job via GitHub Actions yet (it was run manually by the agents).
  Re-verify the deploy.yml migrate step on first push.

## Gates summary
- `npx tsc --noEmit`: **PASS** (clean, exit 0)
- `npm test`: **PASS** (64/64)
- `npm run build` (DB-less): **PASS** (exit 0)
