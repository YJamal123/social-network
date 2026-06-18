# v2 Migration Process — Introducing Prisma ORM (replacing raw `pg`)

> **Status:** DRAFT / PLANNING ONLY. No application code, packages, or migrations
> have been changed by this document. This is the implementable process spec for
> the engineer who will do the work. Every code/config path below is cited; line
> numbers reflect the repo state at the time of writing and should be re-checked.

---

## 0. TL;DR for the reader

- The manager (v2 review) mandated Prisma so the schema stops being a hand-maintained
  idempotent SQL string.
- The authoritative schema today is the inlined `SCHEMA` string in
  `src/app/api/migrate/route.ts:8-130`, applied by a token-guarded `POST /api/migrate`.
- **There are 11 tables** and **16 source files** that touch the DB through the single
  `pg` pool in `src/lib/db.ts`, with **~50 raw-SQL call sites** total.
- Three hard environmental constraints shape everything: (1) **CLAUDE.md and
  `ralph/PROMPT.md` actively forbid ORMs** and will cause autonomous agents to revert
  this work unless updated first; (2) **Cloud SQL is private-IP only** and unreachable
  from a laptop, so Prisma Migrate must run *inside the VPC*; (3) **`db.ts` lazy-inits**
  so `next build` works without a live DB — the Prisma client must preserve this.

---

## 1. Goal & Scope

### Done means
1. `schema.prisma` is the single authoritative data model, version-controlled, and it
   reproduces today's 11 tables exactly (same columns, types, PKs, FKs with
   `ON DELETE CASCADE`, indexes, and `CHECK` constraints).
2. All application reads/writes go through a `PrismaClient` singleton instead of
   `src/lib/db.ts`'s `pg` pool. The pool/`query()` helper is removed (or reduced to a
   thin shim only if something genuinely needs raw SQL — see §6 exceptions).
3. Migrations are authored with `prisma migrate dev` (locally, against a throwaway DB)
   and **applied in production with `prisma migrate deploy` running inside the VPC**,
   replacing the hand-maintained `SCHEMA` string and reconciling the `/api/migrate`
   route.
4. `npx tsc --noEmit`, `npm test`, `npm run build` (DB-less) all pass; the deployed app
   serves every existing endpoint with identical behavior; demo data is intact and
   `/api/seed` still works.
5. CLAUDE.md, `ralph/PROMPT.md`, and `package.json` scripts are updated to *permit and
   describe* Prisma so the QA gate and Ralph loop don't fight it.

### Explicitly out of scope
- No data-model changes, no new features, no renamed tables/columns. This is a
  **like-for-like port**; behavior must not change.
- No switch away from Cloud SQL / PostgreSQL / Cloud Run / GCP (CLAUDE.md "GCP only",
  "No Firestore").
- No NextAuth changes beyond porting the one DB read in `authorize()`
  (`src/lib/auth.ts:17`). The split edge/node config stays.
- No introduction of a connection pooler service (PgBouncer/Data Proxy) in phase 1 —
  but connection-limit tuning IS in scope (see §4).
- Avatar storage stays as `bytea` in `users` — Prisma maps this to `Bytes`.

---

## 2. Decision: `db pull` (introspect) vs author `schema.prisma` fresh

**Recommendation: introspect the live DB with `prisma db pull`, then hand-tune, then
baseline.** Author-fresh is the fallback only if introspection can't be run.

### Why introspect
- The live database is the real source of truth, and it carries **live data**: the demo
  seed (`<username>@demo.sml`, ~17 users, posts, follows, likes, comments, wall_posts,
  pokes, taunts, relationships, friendships, messages — see
  `src/app/api/seed/route.ts`) plus any real signups. Authoring fresh risks subtle
  drift (e.g. the `class_year INT` column added late at
  `src/app/api/migrate/route.ts:129`, the `CHECK (char_length(content) <= 280)`
  constraints, the `CHECK (sender_id <> recipient_id)` on `messages`, the composite PKs
  on join tables). `db pull` captures exactly what exists, eliminating drift by
  construction.
- The migration must be **non-destructive**. The baseline migration (below) must be a
  no-op against the existing DB — it describes state that's already there, so no rows
  are touched.

### The catch (private IP) and how to introspect anyway
`prisma db pull` needs a live connection, and Cloud SQL here is private-IP only
(unreachable from a laptop — see `cloud-run-public-access-blocked.md` and CLAUDE.md
"Gotchas"). Two viable ways to get an introspectable connection:
1. **Cloud SQL Auth Proxy from inside the VPC / Cloud Shell** — run the proxy on a
   Compute Engine VM or in Cloud Shell that sits on the VPC connector, point
   `DATABASE_URL` at `127.0.0.1:5432`, run `db pull` there. This is the cleanest.
2. **Reproduce the schema in a throwaway local Postgres** by running the existing
   `SCHEMA` string (copy `src/app/api/migrate/route.ts:8-130` into a local DB), then
   `db pull` against *that*. This gives an identical `schema.prisma` without ever
   touching prod, because the `SCHEMA` string IS the current prod schema. **This is the
   recommended low-risk path** — it needs no VPC access at all and is fully reproducible.

After introspection, hand-tune the generated `schema.prisma`:
- Rename relations to readable names, add `@@map`/`@map` where Prisma's camelCase model
  names differ from the snake_case DB (`user_id` → `userId @map("user_id")`, etc.).
- Verify `db.Uuid` PKs use `@default(dbgenerated("gen_random_uuid()"))` (the DB uses
  `pgcrypto`'s `gen_random_uuid()` — `migrate/route.ts:9`), and `created_at` uses
  `@default(now())`.
- Prisma does **not** model `CHECK` constraints. The `char_length(content) <= 280`
  checks and the `<>` self-reference checks must be re-added as raw SQL inside the
  baseline migration (Prisma keeps them as long as they live in a migration file). Keep
  application-level length validation too (already enforced by validators in `src/lib/`).

### Baseline the existing DB (so the first migration is a no-op)
Use Prisma's documented baselining flow:
1. `prisma migrate diff` / `prisma migrate dev --create-only` to generate
   `migrations/0_init/migration.sql` from the introspected schema.
2. Hand-append the `CHECK` constraints Prisma dropped.
3. `prisma migrate resolve --applied 0_init` against the prod DB (run **inside the
   VPC**, see §3) to record the baseline as already-applied without executing it.
   Result: prod is "up to date," data untouched, and future `migrate deploy` runs only
   apply *new* migrations.

---

## 3. Migration-execution strategy under the private-IP constraint

This is the crux. `prisma migrate dev` is a **development** command and must NEVER run
against prod (it can reset/drop). Only `prisma migrate deploy` (and `migrate resolve`)
run against prod, and they only apply pending migration files — no introspection, no
drift detection that mutates.

### `url` vs `directUrl`
- For **runtime** (the app), `datasource.url` = the Unix-socket `DATABASE_URL`.
- For **migrations**, Prisma Migrate historically wanted a direct (non-pooled)
  connection. Since phase 1 uses no external pooler, `url` and the migration connection
  are the same physical DB; we still declare `directUrl = env("DIRECT_DATABASE_URL")`
  in the datasource block and point it at the same value so the schema is future-proof
  if a pooler is added later. In phase 1, `DIRECT_DATABASE_URL == DATABASE_URL`.

### How `migrate deploy` actually runs (must be inside the VPC)
Pick ONE of these; **Option A is recommended** because it mirrors the existing,
already-working `/api/migrate` pattern (in-container, reaches private-IP Cloud SQL over
its Unix socket) and needs no new infra:

**Option A — replace `/api/migrate` with a Prisma-Migrate-backed route/command run in
the container (recommended).**
- The prod container already runs inside the VPC and already reaches Cloud SQL over the
  Unix socket (that's how `/api/migrate` works today — see
  `deploy-and-ralph-playbook.md` step 4). Prisma can apply migrations from the same
  place.
- Two sub-variants:
  - **A1 (cleanest):** Add a one-shot step in the CD pipeline that runs
    `prisma migrate deploy` *inside* a container/job on the VPC connector — e.g. a
    `gcloud run jobs` execution using the same image, with the Cloud SQL connection
    attached, run after deploy and before traffic shift. The migration CLI + engine
    ship in the image (see §5).
  - **A2 (lowest-change, mirrors today):** Keep a token-guarded
    `POST /api/migrate` route, but have it shell out to / invoke Prisma Migrate's
    programmatic apply, OR (simpler and supported) have it run the SQL of pending
    migrations. The honest, supported approach is A1 (a Job) — running `migrate deploy`
    from inside a Next.js route handler is awkward because the migrate engine is a
    separate binary. **Recommendation: A1 via a Cloud Run Job; retire the
    `/api/migrate` route once A1 is proven.**

**Option B — Cloud Build step on the VPC connector.** Add a build/deploy step that runs
`prisma migrate deploy` with a private-pool worker attached to the VPC. More infra
(private pool / serverless VPC access for Cloud Build) than Option A.

**Reconciling the existing `/api/migrate` route**
- During the transition, keep `/api/migrate` working (it's idempotent and harmless) so
  rollback is easy.
- Once `prisma migrate deploy` (Option A1 Job) is the path of record:
  - Delete the `SCHEMA` string and the route body in `src/app/api/migrate/route.ts`,
    OR repoint the route to return a clear "migrations are applied via the migrate Job"
    message. **Recommendation: delete the route and the SCHEMA string** so there is one
    source of truth (the `migrations/` folder), and update
    `deploy-and-ralph-playbook.md`, `cicd-github-actions-wif.md`, and `.github/
    workflows/deploy.yml:173-187` (the "Apply DB migration" step that currently
    `curl`s `/api/migrate`) to invoke the migrate Job instead.
- `prisma migrate deploy` is itself idempotent (skips already-applied migrations), so it
  preserves the "run it post-deploy, safely re-runnable" property the team relies on.

### DATABASE_URL Unix-socket format for Prisma
The current connection string is a Cloud SQL Unix socket:
`postgresql://USER:PASS@/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE`
(CLAUDE.md "Environment Variables"). **Prisma supports Unix-domain sockets** via the
`host` query param pointing at the socket directory — exactly this shape. Confirm in
staging that Prisma's connector accepts `?host=/cloudsql/...` (it uses the same libpq-
style socket convention). If Prisma ever rejects the bare form, the documented
alternative is `host=/cloudsql/...` URL-encoded; do not switch to TCP — org policy
blocks public IP. Add `connection_limit` and (optionally) `socket_timeout` as query
params (see §4).

---

## 4. PrismaClient singleton — preserving lazy / build-without-DB behavior

### The constraint to preserve
`src/lib/db.ts:3-18` lazily constructs the `Pool` on first `query()` call, NOT at
import, because a module-level throw breaks `next build` (Next imports route modules
without a live DB — CLAUDE.md "Gotchas: db.ts must lazy-init"). **PrismaClient must not
connect or throw at import time.**

Good news: **`new PrismaClient()` does not connect eagerly** — it connects lazily on the
first query. So a module-level `new PrismaClient()` is generally build-safe. But to be
strictly faithful to the existing lazy-and-validate behavior (and to avoid surprises if
`DATABASE_URL` is missing at import), wrap it in a lazy getter that mirrors today's
`getPool()`:

```ts
// src/lib/db.ts  (proposed)
import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined
}

let client: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — check Secret Manager binding on Cloud Run")
  }
  if (!client) {
    client =
      globalThis.__prisma__ ??
      new PrismaClient({
        // datasources.db.url defaults to DATABASE_URL from schema.prisma
      })
    if (process.env.NODE_ENV !== "production") globalThis.__prisma__ = client
  }
  return client
}

export const prisma = new Proxy({} as PrismaClient, {
  get: (_t, prop) => (getPrisma() as unknown as Record<string | symbol, unknown>)[prop],
})
```

- The `DATABASE_URL` check stays (CLAUDE.md "No `process.env` without fallback
  validation — crash loudly if `DATABASE_URL` is missing").
- The `globalThis` cache prevents dev-mode hot-reload from spawning many clients (the
  standard Prisma + Next.js pattern). In prod a single module instance is fine.
- Exporting `prisma` via a lazy `Proxy` keeps the *getter* lazy so importing
  `src/lib/db.ts` in a route during `next build` does nothing until first property
  access. (If the team prefers, expose only `getPrisma()` and call it at each use site —
  more explicit, slightly more verbose. Either works; pick one and be consistent.)

### Cloud Run connection pooling concerns
- Cloud Run scales to many instances; each instance with its own `PrismaClient` opens
  its own pool. Today's `pg` pool caps at `max: 5` (`src/lib/db.ts:12`). Cloud SQL
  (PostgreSQL 15) has a finite `max_connections`. With Prisma, **set
  `connection_limit` in the `DATABASE_URL`** to a small number (e.g.
  `?connection_limit=5&host=/cloudsql/...`) to match today's footprint and avoid
  exhausting Cloud SQL when many Cloud Run instances are warm.
- Prisma's default `connection_limit` is `num_physical_cpus * 2 + 1`; on Cloud Run that
  can be larger than intended per instance. Pin it explicitly to ~5 (matching the
  current `pg max`). Document the math: `max_connections` on the instance must be
  ≥ (peak Cloud Run instances × connection_limit) + headroom for migrate Jobs/seed.
- **Open question for the human:** if instance count can spike, consider a PgBouncer/
  Cloud SQL connection pooler in phase 2. If/when added, that's when `directUrl`
  (declared in §3) earns its keep — migrations bypass the pooler. (Not needed phase 1.)

---

## 5. Dockerfile / build changes

The prod image is a **standalone Next.js bundle** (`next.config.mjs:4` `output:
"standalone"`) and the runner stage copies only `public`, `.next/standalone`, and
`.next/static` (`Dockerfile:27-29`). It does **not** ship root files (that's why the
schema is inlined in the route today). Prisma needs three things present at runtime:
the **generated client**, the **query-engine binary** for the runtime platform, and (if
running migrations in the image) the **migration engine + `migrations/` folder +
`schema.prisma`**. Changes:

1. **`prisma generate` must run during the build.** Add a `postinstall` script
   (`"postinstall": "prisma generate"`) in `package.json` so `npm ci` in the `deps`/
   `builder` stages (`Dockerfile:8`, runs `npm run build` at line 16) produces the
   client. Also wire it into `build` defensively. The generated client lands in
   `node_modules/.prisma/client` and `node_modules/@prisma/client`.

2. **`binaryTargets` for the Cloud Run/linux runtime.** The build base is
   `node:20-alpine` (`Dockerfile:1`) → **musl libc**, with `libc6-compat` installed
   (`Dockerfile:5`). Prisma engines must match. Set in `schema.prisma`:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
   }
   ```
   Verify the exact musl target for node:20-alpine (OpenSSL 3). If engine-loading errors
   appear at runtime ("Query engine binary for current platform could not be found"),
   the target string is wrong — this is the single most common Prisma-on-Alpine failure.
   *Alternative:* switch the base image to `node:20-slim` (Debian/glibc) and use
   `debian-openssl-3.0.x`; simpler engine story but larger image. **Decision for the
   human:** keep Alpine + musl target (smaller, matches current base) unless engine
   issues prove intractable.

3. **Standalone bundle must include the Prisma client + engine.** Next's standalone
   output traces `node_modules`, but the Prisma **engine binary** (a `.so`/binary, not
   JS) is frequently NOT traced. Two fixes:
   - Add the engine to Next's file tracing:
     ```js
     // next.config.mjs
     experimental: { outputFileTracingIncludes: { "*": ["./node_modules/.prisma/client/*.node", "./node_modules/.prisma/client/schema.prisma"] } }
     ```
     (merge with the existing `experimental` block at `next.config.mjs:5-17`; keep
     `serverActions.allowedOrigins` and `bodySizeLimit` untouched — Ralph guardrail).
   - OR explicitly `COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma`
     into the runner stage of the `Dockerfile`. **Recommendation: do both** (belt and
     suspenders) and verify the engine file is present in the image.

4. **For the migrate Job image (§3 Option A1):** that step needs the Prisma CLI
   (`prisma` is a devDependency) + the `migrations/` folder + `schema.prisma`. Either
   build a second small image stage that includes them, or run `prisma migrate deploy`
   from the `builder` stage contents. Ensure `prisma/` (schema + migrations) is **not**
   excluded by `.dockerignore` (current `.dockerignore` excludes `node_modules`,
   `.next`, `.git`, `skills`, etc. — `prisma/` is fine, but double-check after adding
   it).

5. **`.dockerignore`** — no change needed for the app image, but confirm the new
   `prisma/` directory (schema + migrations) is copied into whatever stage runs
   `prisma generate` and the migrate Job.

---

## 6. Full inventory of raw-SQL call sites to port

**16 files import `@/lib/db`** (verified via grep). `query()` call sites total **~50**
(grep counts 50 occurrences of `query(`; the seed route alone has 13). Grouped by
feature, with suggested **porting order (lowest-risk → highest-risk)**:

### Tier 0 — infra / read-only (port first, easy to verify)
| # | File | Calls | Notes |
|---|---|---|---|
| 1 | `src/app/api/health/route.ts` | 1 | trivial `SELECT 1`-style health check; port first as the smoke test |
| 2 | `src/lib/queries.ts` | 3 | shared readers: `fetchPosts` (complex JOIN + correlated subqueries for `like_count`/`liked_by_me`/`comment_count`), `fetchUserSchool`, `fetchRecentUsers`. **`fetchPosts` is the trickiest read** — its dynamic `cte`/`where`/`params` (`queries.ts:13-36`) maps to Prisma `_count`/relation filters OR stays raw via `prisma.$queryRaw`. See "exceptions" below. |
| 3 | `src/lib/directory.ts` | 0 direct (builds SQL fragments) | pure helper that constructs `where` strings consumed by `directory/page.tsx`. Re-think for Prisma `where` objects. |
| 4 | `src/app/(main)/directory/page.tsx` | 1 | uses `query<DirectoryRow>` with the `directory.ts` fragment (`directory/page.tsx:19`). |
| 5 | `src/app/api/avatar/[id]/route.ts` | 1 | reads `avatar`/`avatar_mime` `bytea` (`route.ts:19`) → Prisma `Bytes`. Verify Buffer round-trip. |

### Tier 1 — auth & profile reads (port next)
| # | File | Calls | Notes |
|---|---|---|---|
| 6 | `src/lib/auth.ts` | 1 | `SELECT * FROM users WHERE email = $1` (`auth.ts:17`). **Lives in the node-only `auth.ts`, NOT `auth.config.ts`** — keep it that way (edge boundary; CLAUDE.md gotcha). Prisma import must never leak into `auth.config.ts`/`middleware.ts`. |
| 7 | `src/app/(main)/profile/[username]/page.tsx` | 1 | profile read. |
| 8 | `src/app/(main)/profile/[username]/edit/page.tsx` | 1 | edit-form prefill read (`edit/page.tsx:18`). |

### Tier 2 — simple mutations (mirror the poke pattern)
| # | File | Calls | Notes |
|---|---|---|---|
| 9 | `src/app/(auth)/register/actions.ts` | 1 | insert user; must keep `{ error?: string }` return + `redirect()` outside try/catch (CLAUDE.md). Catch Prisma unique-violation (`P2002`) for duplicate email/username instead of pg error code. |
| 10 | `src/app/(main)/feed/actions.ts` | 5 | create post, like/unlike, comment. |
| 11 | `src/app/(main)/pokes/actions.ts` | 4 | upsert poke (`ON CONFLICT DO UPDATE` → Prisma `upsert`), count, pokeBack, acknowledge (`pokes/actions.ts:26,51,78-87,107`). **Canonical pattern** — port this carefully, the rest mirror it. |
| 12 | `src/app/(main)/taunts/actions.ts` | 4 | fork of pokes + cross-school guard. |
| 13 | `src/app/(main)/messages/actions.ts` | 2 | send DM, mark read. |

### Tier 3 — complex mutations / relations (port last)
| # | File | Calls | Notes |
|---|---|---|---|
| 14 | `src/app/(main)/friends/actions.ts` | 6 | request/confirm friendship, mutual-friends counts, pending counts. Composite-PK upserts + symmetric-edge logic. |
| 15 | `src/app/(main)/profile/actions.ts` | 9 | **largest mutation surface**: updateProfile, relationship propose/confirm, wall posts, avatar `bytea` write (`profile/actions.ts:413`), relationship reads (`profile/actions.ts:316,366`). Multiple `ON CONFLICT` upserts. Port after pokes pattern is proven. |
| 16 | `src/app/api/seed/route.ts` | 13 | **the big one.** A single `BEGIN/COMMIT` transaction (`seed/route.ts:669,844`) inserting ~17 users + posts/follows/likes/comments/wall_posts/pokes/taunts/relationships/friendships/messages, with `now() - ($n || ' hours')::interval` timestamp math (e.g. `seed/route.ts:719-723`), `RETURNING id` to thread generated UUIDs, and `ON CONFLICT` upserts. Port to a Prisma `$transaction([...])`. The interval math can be computed in JS (`new Date(Date.now() - hours*3600e3)`) and passed as a value, avoiding raw SQL. **This is the highest-effort file** — do it last, after the model + client are proven by the live app. |

### Exceptions — where raw SQL may stay (`prisma.$queryRaw`)
- `src/lib/queries.ts` `fetchPosts`: the dynamic `cte`/`where`/`params` plus correlated
  count subqueries are expressive in SQL. Porting to Prisma relation-count selects is
  doable (`_count`, `some` filters) but changes the query shape. **Recommendation:**
  port to Prisma's typed API if clean; otherwise keep it as a single typed
  `prisma.$queryRaw<PostWithAuthor[]>` — Prisma fully supports parameterized raw SQL,
  so "no ORM" → "Prisma" doesn't force losing this. Flag the choice in PR review.
- Anything using `gen_random_uuid()` / `now()` DB defaults keeps those as schema
  defaults (`@default(dbgenerated(...))` / `@default(now())`), so inserts don't supply
  them — same as today.

---

## 7. Step-by-step sequenced process

> Each phase ends with a green gate (`tsc` + `build` at minimum). Commit per phase.

**Phase 0 — Unblock the guardrails (MUST be first).**
0.1 Update `CLAUDE.md`: change "No ORM / Raw `pg` only" and the "Never Do This → No
   ORM. No Prisma, Drizzle, TypeORM" lines to *permit Prisma* and describe the new
   workflow (schema in `prisma/schema.prisma`, migrations via `prisma migrate deploy`
   inside the VPC, client via `src/lib/db.ts` `getPrisma()`). Update the "Coding
   Standards", "Database Schema", and "Gotchas" sections accordingly.
0.2 Update `ralph/PROMPT.md:18` ("Raw `pg` only, no ORM…") and `:20` ("One Pool via
   `query()`…") so any future Ralph iteration uses Prisma, not raw `pg`.
0.3 Note `.git/hooks/pre-push` runs the `qa-runner` subagent — it reads CLAUDE.md, so
   0.1 must land before any Prisma push or QA may object. (Doc-only commits can use
   `git push --no-verify` per CLAUDE.md, but prefer landing 0.1 cleanly.)
**Why first:** otherwise the autonomous QA/Ralph agents will treat Prisma as a rule
violation and revert it.

**Phase 1 — Install & scaffold (no behavior change).**
1.1 `npm i -D prisma` and `npm i @prisma/client` (do NOT `npm audit fix --force` —
   CLAUDE.md). Commit lockfile.
1.2 `npx prisma init` → creates `prisma/schema.prisma`. Set `provider = "postgresql"`,
   `datasource.url = env("DATABASE_URL")`, `directUrl = env("DIRECT_DATABASE_URL")`,
   and the `generator` `binaryTargets` from §5.

**Phase 2 — Schema source of truth.**
2.1 Stand up a throwaway local Postgres, apply the current `SCHEMA` string
   (`src/app/api/migrate/route.ts:8-130`) to it.
2.2 `prisma db pull` against that local DB → generates `schema.prisma`. Hand-tune
   (relation names, `@map`, defaults) per §2.
2.3 `prisma migrate dev --name init --create-only` → `migrations/0_init/migration.sql`.
   Hand-append the `CHECK` constraints Prisma omitted (the three `char_length<=280`
   checks, `messages` and `friendships` self-reference checks).
2.4 `prisma generate` → typed client. Commit `prisma/` + lockfile.

**Phase 3 — Prisma client singleton.**
3.1 Replace `src/lib/db.ts` internals with the lazy `getPrisma()`/`prisma` singleton
   (§4), keeping the `DATABASE_URL` crash-loud check. Keep the file path/exports stable
   where possible to minimize import churn, or update imports in the 16 files.
3.2 Add the Cloud Run `connection_limit` to `DATABASE_URL` (Secret Manager value).
   Coordinate with whoever owns the secret; this is a value change, applied on the
   service, not in the repo.

**Phase 4 — Port call sites (lowest-risk first, per §6 tiers).**
4.1 Tier 0 (health, queries.ts, directory, avatar). After each file: `tsc` + `build`.
4.2 Tier 1 (auth.ts, profile reads) — re-verify the edge boundary: grep that
   `auth.config.ts` and `middleware.ts` import **no** Prisma.
4.3 Tier 2 (register, feed, pokes, taunts, messages). Map `ON CONFLICT` → `upsert`,
   pg unique-violation → Prisma `P2002`. Preserve `{ error?: string }` + `redirect()`
   placement.
4.4 Tier 3 (friends, profile/actions, seed). Seed → `prisma.$transaction`, interval
   math in JS.
4.5 Decide per §6 which (if any) reads stay as `prisma.$queryRaw` (likely just
   `fetchPosts`).
4.6 Remove the `pg`/`@types/pg` dependencies once nothing imports them; delete the old
   pool code. Keep `bcryptjs` (unrelated).

**Phase 5 — Migration execution wiring (production).**
5.1 Build the migrate Job image / step (§3 Option A1): a Cloud Run Job (same image)
   that runs `prisma migrate deploy`, attached to Cloud SQL.
5.2 Baseline prod: run `prisma migrate resolve --applied 0_init` once, inside the VPC,
   so the existing DB is marked migrated without re-running DDL (data untouched).
5.3 Update `.github/workflows/deploy.yml` — replace the "Apply DB migration" step
   (`deploy.yml:173-187`, currently `curl .../api/migrate`) with an invocation of the
   migrate Job (`gcloud run jobs execute …`). Keep the token/newline handling out of
   the path entirely (the Job uses the Cloud SQL binding, not an HTTP token).
5.4 Retire `/api/migrate`: delete `src/app/api/migrate/route.ts` and the `SCHEMA`
   string. Update `deploy-and-ralph-playbook.md` and `cicd-github-actions-wif.md`.
5.5 `/api/seed` stays an HTTP route (it's app code using the Prisma client now), still
   token-guarded; CD intentionally does NOT run it (destructive) — unchanged policy
   (`cicd-github-actions-wif.md`).

**Phase 6 — Verify (see §10 checklist).**

---

## 8. Doc / config updates required

| File | Change |
|---|---|
| `CLAUDE.md` | Remove ORM ban; document Prisma schema location, `getPrisma()` client rule, `prisma migrate deploy` in-VPC flow, updated "Database Schema" + "Gotchas" + "Never Do This". |
| `ralph/PROMPT.md` | Lines 18 & 20: replace "Raw `pg` only / One Pool via `query()`" with Prisma equivalents. |
| `package.json` | Add `prisma` devDep + `@prisma/client` dep; add scripts: `"postinstall": "prisma generate"`, `"db:generate": "prisma generate"`, `"db:migrate:dev": "prisma migrate dev"`, `"db:migrate:deploy": "prisma migrate deploy"`. Remove `pg` + `@types/pg` at the end of Phase 4. |
| `next.config.mjs` | Add `experimental.outputFileTracingIncludes` for the Prisma engine (merge into existing block; do NOT touch `serverActions`). |
| `Dockerfile` | Ensure `prisma generate` runs (via `postinstall` during `npm ci`); `COPY` `node_modules/.prisma` into runner stage; build the migrate-Job path. |
| `.github/workflows/deploy.yml` | Replace `/api/migrate` curl step with migrate-Job execution. `ci.yml` needs `prisma generate` to run before `next build` (the `postinstall` covers it on `npm ci`). |
| memory: `deploy-and-ralph-playbook.md`, `cicd-github-actions-wif.md`, `nextauth-secret-trailing-newline.md` | Update the migrate-flow references (no more `/api/migrate` token curl; `/api/seed` still token-curl). |
| `schema.sql` (root) | Already a "stale reference copy" per CLAUDE.md — either delete it or regenerate from `schema.prisma` to avoid a third source of truth. **Recommendation: delete.** |

---

## 9. Risks, rollback, open questions

### Risks
1. **Guardrail revert risk (highest).** If Phase 0 is skipped, the `qa-runner` pre-push
   hook and any Ralph run will treat Prisma as a violation. Mitigation: Phase 0 first.
2. **Engine/platform mismatch on Alpine/musl.** Wrong `binaryTargets` → runtime
   "engine not found." Mitigation: pin `linux-musl-openssl-3.0.x`, verify the engine
   file is in the image, smoke-test before traffic shift.
3. **Standalone bundle drops the engine.** Next file-tracing may not include the engine
   binary. Mitigation: `outputFileTracingIncludes` + explicit `COPY` (§5), verified.
4. **Connection exhaustion on Cloud Run.** Many instances × Prisma default
   `connection_limit` can exceed Cloud SQL `max_connections`. Mitigation: pin
   `connection_limit=5`, document the budget; consider a pooler in phase 2.
5. **Unix-socket URL not accepted by Prisma.** Low probability (Prisma supports
   `?host=`), but must be verified in staging before cutover.
6. **Baseline goes wrong → destructive.** If `migrate resolve --applied` is skipped and
   `migrate deploy` runs DDL that conflicts with existing objects, it could error (not
   silently drop, but could block). Mitigation: baseline carefully; the `0_init`
   migration is `CREATE TABLE` (Prisma uses plain `CREATE`, not `IF NOT EXISTS`), so it
   MUST be marked applied, never executed, against prod.
7. **`fetchPosts` semantics drift.** Reworking the correlated-subquery counts in Prisma
   could subtly change `like_count`/`liked_by_me`. Mitigation: keep as `$queryRaw` if
   unsure; compare outputs against current prod.
8. **`bytea` ↔ `Bytes` avatar round-trip.** Verify Buffer in/out for avatar upload
   (`profile/actions.ts:413`) and serve (`avatar/[id]/route.ts`).

### Rollback plan
- Prisma lands behind a branch; the old `pg` path stays until Phase 4 completes.
- Because the baseline migration is a no-op against the live DB, **no data change is
  required to introduce Prisma** — rollback = redeploy the previous image (which still
  has `/api/migrate` + `pg`). Keep `/api/migrate` and the `SCHEMA` string until Phase 5
  is proven so a one-image-revert fully restores the old flow.
- Cloud Run keeps prior revisions; `gcloud run services update-traffic --to-revisions`
  reverts instantly.

### Open questions for the human
- **Q1.** Approve the migrate-execution mechanism: Cloud Run **Job** (recommended A1) vs
  keeping a token route vs Cloud Build VPC step? Affects infra/IAM.
- **Q2.** Keep Alpine base + musl engine, or switch to `node:20-slim` (glibc) for a
  simpler engine story at the cost of image size?
- **Q3.** Is `fetchPosts` allowed to stay `prisma.$queryRaw`, or must everything be the
  typed API? (Affects scope/effort.)
- **Q4.** Phase-1 connection pooling: pin `connection_limit=5` only, or stand up a
  pooler now? (Depends on expected Cloud Run concurrency/instance count.)
- **Q5.** Who runs the one-time `prisma migrate resolve --applied 0_init` inside the VPC
  (needs Cloud SQL access — Cloud Shell + Auth Proxy, or a Job)?
- **Q6.** Confirm Cloud SQL `max_connections` headroom for the chosen `connection_limit`
  × peak instances + migrate/seed.

---

## 10. Verification checklist

Static / build:
- [ ] `npx prisma validate` passes; `prisma generate` produces a client.
- [ ] `npx tsc --noEmit` clean (no `any`; types still sourced from `src/lib/types.ts`
      or Prisma-generated types).
- [ ] `npm test` (Vitest) green — pure-logic tests in `src/lib/` unaffected.
- [ ] `npm run build` (DB-less) passes — proves the client doesn't connect/throw at
      import (the lazy-init property is preserved).
- [ ] `auth.config.ts` and `middleware.ts` import **no** Prisma/`@prisma/client`
      (edge boundary intact) — grep to confirm.

Image / deploy:
- [ ] Prisma query engine binary present in the standalone image (inspect the built
      image: engine file under `node_modules/.prisma/client`).
- [ ] Container boots on Cloud Run; first query connects (no "engine not found", no
      "DATABASE_URL not set").

Migration / data:
- [ ] `prisma migrate resolve --applied 0_init` recorded; `prisma migrate status`
      reports "up to date" against prod with **zero** pending DDL executed.
- [ ] Row counts before == after for all 11 tables (demo data intact; no destructive
      change). Spot-check a demo login (`<user>@demo.sml` / `demo1234`).
- [ ] `prisma migrate deploy` is idempotent — re-running it is a no-op.

Behavioral (every ported endpoint returns identical data):
- [ ] `GET /api/health` OK.
- [ ] Login (`authorize`) succeeds for demo creds; bad creds → graceful null, not 500.
- [ ] Register a new user (unique-violation handled → `{ error }`, no throw).
- [ ] Feed: posts list with correct `like_count` / `liked_by_me` / `comment_count`;
      create post; like/unlike; comment.
- [ ] Profile read + edit (incl. avatar upload write `bytea` and `GET /api/avatar/[id]`
      serve round-trip).
- [ ] Pokes / Taunts (cross-school guard) / Friends (confirm + counts) / Relationships
      (propose/confirm) / Messages (send + unread badge) all behave as before.
- [ ] Directory search filters return the same rows as the raw-SQL version.
- [ ] `POST /api/seed` (token-guarded) runs in one transaction, wipes `@demo.sml`,
      reinserts, returns the same counts.
