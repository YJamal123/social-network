# v2 Migration Process — Introducing Prisma ORM (replacing raw `pg`) — FINAL

> **Status:** HARDENED FINAL / PLANNING ONLY. No application code, packages, or
> migrations have been changed by this document. This is the implementable process
> spec for the engineer who will do the work. Every code/config path below is cited
> with file + line numbers verified against the repo at the time of writing
> (branch `ci/cloud-build-suppress-logs`). Re-check line numbers before editing.
>
> This supersedes `prisma-draft.md`. It is self-contained — you do not need the draft.

---

## Changes from draft / what the critique caught

These are the concrete corrections, with why:

1. **WRONG line citation for the deploy migrate step.** The draft cites
   `.github/workflows/deploy.yml:173-187`. The file is only **186 lines**; the
   "Apply DB migration (idempotent)" step is at **`deploy.yml:173-186`** and the
   actual `curl` is at **lines 185-186**. Corrected throughout (§3, §5, §8).

2. **WRONG/over-stated `directUrl` rationale.** The draft says to declare
   `directUrl` "so the schema is future-proof." That is fine, but the draft implies
   `migrate deploy` *needs* a non-pooled connection in phase 1. It does **not** —
   there is no pooler in phase 1, so `directUrl == url`. More importantly, the draft
   never says that **`directUrl` is only consulted by Migrate/Introspect CLI commands,
   not by the runtime client**, and that **the shadow-database requirement applies to
   `migrate dev`, not `migrate deploy`**. Both clarified in §2/§3. Recommendation
   changed: in phase 1 **omit `directUrl` entirely** to avoid a second required env
   var on Cloud Run that does nothing; add it only when a pooler arrives. (Stated as
   an assumption; the draft's "declare it now" is acceptable but adds a Secret Manager
   binding for no phase-1 benefit.)

3. **MISSED: `prisma generate` ordering vs `tsc` in CI will break the build.**
   `ci.yml:46-47` runs `npx tsc --noEmit` immediately after `npm ci`
   (`ci.yml:42-43`), *before* `next build`. Without a generated client,
   `@prisma/client` exports no model types and **`tsc` fails**. The draft mentions
   `postinstall: prisma generate` but never connects it to this hazard. The
   `postinstall` script *does* fix it (npm runs `postinstall` at the end of
   `npm ci`), but this is load-bearing and must be called out explicitly, plus a
   fallback if `postinstall` is ever stripped. Added to §5 and §7 Phase 1.

4. **MISSED: `prisma generate` needs a `schema.prisma` to exist.** A `postinstall`
   that runs `prisma generate` will **fail `npm ci`** if `prisma/schema.prisma` is
   absent (e.g. between Phase 1.1 installing the dep and Phase 2 creating the schema,
   or on a partial checkout). Sequencing fixed in §7: install + scaffold schema in
   the **same commit** so `npm ci` never runs without a schema. Added a guard note.

5. **MISSED: the `db.ts` default export.** The seed route imports the **default**
   export: `import getPool from "@/lib/db"` (`seed/route.ts:3`) and calls
   `getPool().connect()` for a manual `BEGIN/COMMIT` transaction. Every other file
   imports the **named** `query`. The draft's singleton only addresses `query`/a
   `prisma` proxy; it must also remove/replace the default export, and the seed
   transaction must move to `prisma.$transaction`. Corrected in §4 and §6 (seed).

6. **SHARPENED: `bytea` ↔ `Bytes` round-trip is already safe.** The draft says
   "verify Buffer round-trip." Verified: the avatar **read** does
   `new Uint8Array(row.avatar)` (`avatar/[id]/route.ts:29`) and the **write** passes
   a `Buffer` (`profile/actions.ts:411-415`). Prisma maps `bytea`→`Bytes` and returns
   a Node `Buffer`, and accepts `Buffer`/`Uint8Array` on write — so both sites work
   unchanged in shape. Downgraded from "risk" to "verify-only," with the exact
   mapping spelled out (§6, §9).

7. **SHARPENED: `ON CONFLICT ... DO UPDATE SET created_at = now()` semantics.**
   Pokes/taunts/relationships/friendships upserts set `created_at = now()` (or
   `acknowledged = false`) on the **update** branch (e.g. `pokes/actions.ts:28-29`,
   `profile/actions.ts:198-199`). Prisma `upsert`'s `update:` block must **explicitly**
   set `createdAt: new Date()` — Prisma will NOT auto-bump `created_at` (there is no
   `@updatedAt` on these columns, and there shouldn't be). The draft said "map
   `ON CONFLICT` → `upsert`" without flagging that the update branch's `now()`/reset
   fields must be reproduced by hand. Detailed in §6.

8. **CONFIRMED count claims, with one nuance.** "16 files import `@/lib/db`" — **correct**
   (verified). "~50 `query(` call sites" — **correct** (exactly 50; per-file table in
   §6 re-verified and now exact, not "~"). The seed route has **13** `query(` calls —
   **correct**. `directory.ts` has **0** direct `query()` (it only builds SQL
   fragments) — **correct**. Note the draft's "11 tables" — **correct** (users, posts,
   follows, likes, comments, wall_posts, pokes, taunts, relationships, friendships,
   messages).

9. **MISSED infra reality: deploy uses Cloud Build + a least-privilege SA.** Per the
   `cicd-github-actions-wif` memory, deploy is `gcloud builds submit` (NOT local
   docker) and the deploy SA `github-deployer@…` has only
   `run.admin, cloudbuild.builds.editor, artifactregistry.writer, storage.admin,
   iam.serviceAccountUser`. A Cloud Run **Job** that runs `migrate deploy` needs:
   (a) the Job to have the **Cloud SQL connection** attached and the Job's **runtime
   service account** to hold `roles/cloudsql.client`; (b) the deploy SA to be able to
   create/execute the Job (`run.admin` covers Jobs). This IAM gap is new in §3/§5 and
   is now an explicit open question (Q5/Q7). The draft's "no new infra" claim for
   Option A is **partially wrong** — a Job *is* new infra with its own IAM.

10. **SHARPENED: `migrate deploy` advisory lock + idempotency.** Added that Prisma
    Migrate takes a **Postgres advisory lock** during `deploy`; two concurrent
    migrate Jobs (e.g. overlapping deploys) will serialize/one will wait — fine, but
    worth knowing. Idempotency claim in the draft is correct.

11. **CONFIRMED: build-without-DB is preserved**, with a caveat the draft got right
    but under-explained: `new PrismaClient()` does not connect at construction, but
    **importing `@prisma/client` requires the generated client to exist at build
    time** — so `prisma generate` must run before `next build` *and* before `tsc`
    (see #3). The lazy `getPrisma()` wrapper preserves the crash-loud `DATABASE_URL`
    check. Verified `db.ts:5-18` is the lazy pattern to mirror.

12. **NOTE: `schema.sql` at root is 46 lines and genuinely stale** (verified — it
    predates the late `messages`/`friendships` tables and `class_year`/avatar
    columns). Recommendation to delete stands (§8).

13. **NOTE: local Node is v22, but Dockerfile/CI pin Node 20** (`Dockerfile:1`
    `node:20-alpine`, `ci.yml` `node-version: 20`). Engine `binaryTargets` must target
    the **runtime** (node:20-alpine = musl), not the dev laptop. The draft's musl
    target is right; added the explicit reminder not to be misled by the local glibc/
    arm64 machine.

---

## 0. TL;DR for the reader

- The manager (v2 review) mandated Prisma so the schema stops being a hand-maintained
  idempotent SQL string.
- The authoritative schema today is the inlined `SCHEMA` string in
  `src/app/api/migrate/route.ts:8-130`, applied by a token-guarded `POST /api/migrate`
  (route handler at `:132-145`).
- **There are 11 tables**, **16 source files** import the single `pg` helper in
  `src/lib/db.ts`, and there are **exactly 50 `query(` call sites** total.
- Three hard environmental constraints shape everything: (1) **CLAUDE.md "Never Do
  This → No ORM" and `ralph/PROMPT.md` line 18 actively forbid ORMs** and will cause
  the pre-push `qa-runner` and any Ralph iteration to treat Prisma as a violation
  unless updated first; (2) **Cloud SQL is private-IP only** (org policy blocks public
  IP) and unreachable from a laptop, so Prisma Migrate must reach the DB *from inside
  the VPC* (over the Cloud SQL Unix socket the container already uses); (3) **`db.ts`
  lazy-inits** (`db.ts:5-18`) so `next build` and `tsc` work without a live DB — the
  Prisma client must preserve this, AND `prisma generate` must run before `tsc`/build.

---

## 1. Goal & Scope

### Done means
1. `prisma/schema.prisma` is the single authoritative data model, version-controlled,
   reproducing today's 11 tables exactly (columns, types, PKs, FKs with
   `ON DELETE CASCADE`, indexes, and — preserved via raw SQL inside the baseline
   migration — the `CHECK` constraints).
2. All application reads/writes go through a `PrismaClient` singleton instead of the
   `pg` pool. `src/lib/db.ts`'s `Pool`/`query()`/default `getPool` export are removed
   (or reduced to a thin `$queryRaw` shim only where genuinely needed — see §6
   exceptions).
3. Migrations are authored locally with `prisma migrate dev` (against a throwaway DB)
   and **applied in production with `prisma migrate deploy` running inside the VPC**
   (see §3), replacing the hand-maintained `SCHEMA` string and the `/api/migrate`
   route.
4. `npx tsc --noEmit`, `npm test`, `npm run build` (DB-less) all pass; the deployed app
   serves every existing endpoint with identical behavior; demo data is intact and
   `/api/seed` still works.
5. CLAUDE.md, `ralph/PROMPT.md`, and `package.json` are updated to *permit and
   describe* Prisma so the QA gate and Ralph loop don't fight it.

### Explicitly out of scope
- No data-model changes, no new features, no renamed tables/columns. **Like-for-like
  port**; behavior must not change.
- No switch away from Cloud SQL / PostgreSQL / Cloud Run / GCP (CLAUDE.md "GCP only",
  "No Firestore").
- No NextAuth changes beyond porting the one DB read in `authorize()`
  (`src/lib/auth.ts:17`). The split edge/node config (`auth.config.ts` /
  `middleware.ts`) stays; **Prisma must never be imported into `auth.config.ts` or
  `middleware.ts`** (edge runtime — same rule that keeps `pg`/`bcrypt` out today).
- No connection-pooler service (PgBouncer/Data Proxy) in phase 1 — but
  `connection_limit` tuning IS in scope (§4).
- Avatar storage stays as `bytea` in `users` — Prisma maps this to `Bytes` (returns a
  Node `Buffer`).

---

## 2. Decision: `db pull` (introspect) vs author `schema.prisma` fresh

**Recommendation: introspect a faithful *throwaway* DB built from the current `SCHEMA`
string with `prisma db pull`, then hand-tune, then baseline.** This needs **no VPC
access at all** and never touches prod.

### Why introspect (from the throwaway DB, not prod)
- The `SCHEMA` string at `migrate/route.ts:8-130` **is** the current prod schema
  (it's the only thing that has ever created/altered prod tables). Stand up a local
  throwaway Postgres, apply that exact string, and `db pull` against it. The result is
  byte-for-byte the prod shape, captured by construction — no drift, no risk of
  forgetting the late `class_year INT` column (`migrate/route.ts:129`), the three
  `CHECK (char_length(content) <= 280)` constraints (posts `:23`, comments `:50`,
  wall_posts `:60`, comments/messages `:112`), the two self-reference checks
  (`friendships` `:103`, `messages` `:115`), or the composite PKs on join tables.
- Pulling from the **throwaway** rather than prod also means the introspection step is
  fully reproducible in CI/locally and avoids needing Cloud SQL Auth Proxy access just
  to author the schema.

> **Why not author fresh?** Hand-authoring risks subtle drift from the eight
> `ALTER TABLE ADD COLUMN` lines (`migrate/route.ts:121-129`) and the index/PK/CHECK
> details. Introspection eliminates that class of error.

### After introspection, hand-tune `schema.prisma`
- Add `@@map`/`@map` so snake_case DB names survive while models read naturally
  (Prisma will already emit these from `db pull`; verify them). E.g.
  `userId Int @map("user_id")`, `@@map("wall_posts")`.
- **UUID PKs:** ensure `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
  (the DB uses `pgcrypto`'s `gen_random_uuid()` — `migrate/route.ts:9,12`). `db pull`
  usually captures this; confirm the `@db.Uuid` native type and the `dbgenerated`
  default are present so inserts don't have to supply an id (matching today).
- **Timestamps:** `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)`.
  Confirm `@db.Timestamptz` (not `Timestamp`) — the columns are `TIMESTAMPTZ`.
- **`bytea`:** `avatar Bytes? @db.ByteA @map("avatar")` (nullable). Read returns a
  `Buffer`; write accepts `Buffer`/`Uint8Array`.
- **Composite PKs:** join tables (`follows`, `likes`, `pokes`, `taunts`,
  `relationships`, `friendships`) need `@@id([...])` blocks. `db pull` emits these;
  verify the column order matches the SQL PK order.
- **Relations:** name the two self-relations on `users` for each edge table readably
  (e.g. `poker`/`pokee`, `requester`/`addressee`, `sender`/`recipient`,
  `follower`/`following`). Prisma requires explicit relation names when a model has
  two FKs to the same table — `db pull` generates placeholder names; rename them.
- **CHECK constraints:** Prisma **does not model `CHECK`**. The `char_length<=280`
  checks and the two `<>` self-reference checks will be **dropped from
  `schema.prisma`**. They MUST be re-added as raw SQL inside the baseline migration
  file (§2 baseline, step 2) so they persist. Keep application-level length validation
  too (already enforced by `src/lib/validation` and the actions).
- **No enums:** `relationships.status` and `users.relationship_status` are free-text
  `TEXT`, not Postgres enums — keep them `String`. Do not "improve" them into Prisma
  enums (that would be a schema change, out of scope).

### Baseline the existing DB (so the first migration is a no-op)
Prisma's documented baselining flow:
1. Generate the init migration from the introspected schema:
   `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
   --script > prisma/migrations/0_init/migration.sql`
   (or `prisma migrate dev --name init --create-only` against the throwaway DB — both
   produce the same DDL; `migrate diff` avoids needing a shadow DB).
2. **Hand-append the `CHECK` constraints** Prisma omitted, into
   `prisma/migrations/0_init/migration.sql`:
   - `ALTER TABLE posts ADD CONSTRAINT posts_content_len CHECK (char_length(content) <= 280);`
     (and the same for `comments`, `wall_posts`, `messages`).
   - `ALTER TABLE friendships ADD CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id);`
   - `ALTER TABLE messages ADD CONSTRAINT messages_no_self CHECK (sender_id <> recipient_id);`
   (Names are illustrative; the live constraints are currently anonymous, so on a
   fresh DB these explicit names are fine. On prod they are **never executed** —
   see step 3 — so they only matter for any future from-scratch DB.)
3. `prisma migrate resolve --applied 0_init` **against prod, run inside the VPC**
   (§3). This records the baseline as already-applied **without executing it** — prod
   is marked "up to date," data untouched. Future `migrate deploy` runs then apply
   only *new* migrations.

> **Non-destructiveness guarantee:** Prisma's `0_init` uses plain `CREATE TABLE`
> (NOT `IF NOT EXISTS`). If it were ever *executed* against prod it would error on the
> existing tables (it would NOT silently drop them). The safety comes entirely from
> `migrate resolve --applied`, which marks it applied without running it. **Never run
> `migrate deploy` against prod before the resolve.** (Risk #6, §9.)

---

## 3. Migration-execution strategy under the private-IP constraint

`prisma migrate dev` is a **development** command (it can reset/drop and needs a shadow
DB) and must **NEVER** run against prod. Only `prisma migrate deploy` and
`prisma migrate resolve` run against prod; they only apply/record pending migration
files — no destructive drift detection.

### `url` vs `directUrl` vs shadow DB (corrected)
- **Runtime (the app):** `datasource.url = env("DATABASE_URL")` — the Cloud SQL Unix
  socket string. This is the only URL the generated client uses.
- **`directUrl`:** consulted **only** by Migrate/Introspect CLI commands, and only
  matters when a connection **pooler** sits in front of the DB (migrations must bypass
  it). Phase 1 has **no pooler**, so `directUrl` would equal `url` and buys nothing but
  a second mandatory env var on Cloud Run. **Recommendation: omit `directUrl` in phase
  1**; add it (and a non-pooled `DIRECT_DATABASE_URL`) only when/if a pooler lands
  (phase 2). (Assumption: no pooler in phase 1 — see Q4.)
- **Shadow database:** required by `migrate dev` only (it diffs against a scratch DB).
  It is **not** needed by `migrate deploy` or `migrate resolve`. So prod never needs a
  shadow DB. Locally, `migrate dev` will create/drop a shadow DB on your throwaway
  Postgres automatically (ensure the local role can `CREATEDB`), or use
  `--create-only`/`migrate diff` to skip it (recommended for the init step).

### How `migrate deploy` actually runs (must be inside the VPC)

**Option A — Cloud Run Job running `prisma migrate deploy` (RECOMMENDED).**
The prod container already reaches private-IP Cloud SQL over the Unix socket (that's
how `/api/migrate` works today — see the `deploy-and-ralph-playbook` memory, step 4).
A one-shot **Cloud Run Job** built from the same image (or a thin migrate image, §5.4)
runs `prisma migrate deploy` with the Cloud SQL instance attached. Run it after deploy,
before/around traffic shift.

- **This IS new infra**, contrary to the draft's "no new infra." Specifically:
  - The Job needs `--add-cloudsql-instances=<PROJECT:REGION:INSTANCE>` and the same
    `DATABASE_URL` secret binding the service has.
  - The Job's **runtime service account** must hold `roles/cloudsql.client`.
  - The **deploy SA** (`github-deployer@…`) already has `roles/run.admin`, which
    covers creating and executing Jobs — but confirm it can also act as the Job's
    runtime SA (`roles/iam.serviceAccountUser` on that SA — the deploy SA already has
    `iam.serviceAccountUser`, verify it's scoped to the Job's runtime SA).
  - `gcloud run jobs deploy <job> --image=$IMAGE --region=… --add-cloudsql-instances=…
    --set-secrets=DATABASE_URL=… --command=npx --args=prisma,migrate,deploy`
    then `gcloud run jobs execute <job> --wait`.
- The migrate CLI + migration engine + `prisma/` (schema + `migrations/`) must be in
  the image used by the Job (§5.4).

**Option B — Cloud Build step on a VPC-connected private pool.** Add a build step that
runs `prisma migrate deploy` from a Cloud Build **private pool** attached to the VPC.
More setup (private pool + serverless VPC access for Cloud Build) than Option A, and
the current deploy SA lacks the private-pool roles. **Not recommended** for phase 1.

**Option C (interim, lowest-change) — keep `/api/migrate`, but stop hand-maintaining
`SCHEMA`.** During transition you may keep the existing route working unchanged so a
one-image rollback restores the old flow (§9 rollback). Do **not** try to invoke the
Prisma migrate engine from inside a Next.js route handler — the engine is a separate
binary and this is awkward/unsupported. Use Option A as the path of record and retire
the route once A is proven.

**Recommendation: Option A (Cloud Run Job), retire `/api/migrate` after A is proven.**

### Advisory lock & idempotency
- `prisma migrate deploy` takes a **Postgres advisory lock** for the duration. Two
  overlapping migrate Jobs serialize (one waits) — harmless, but don't fire many in
  parallel.
- `migrate deploy` is **idempotent**: it skips already-applied migrations. Re-running
  it is a no-op — preserving the "safe to re-run post-deploy" property the team relies
  on today.

### Reconciling / retiring the existing `/api/migrate` route
- Keep `/api/migrate` + the `SCHEMA` string until Option A is proven in prod (cheap
  rollback).
- Then: **delete** `src/app/api/migrate/route.ts` (route handler `:132-145`) and the
  `SCHEMA` string so the only schema source of truth is `prisma/migrations/`. Update
  the **"Apply DB migration (idempotent)" step at `.github/workflows/deploy.yml:173-186`**
  (the `curl … /api/migrate` is at `:185-186`) to instead run
  `gcloud run jobs execute <migrate-job> --wait --region=… --project=…`. The
  MIGRATE_TOKEN / trailing-newline dance (`deploy.yml:175-184`,
  `nextauth-secret-trailing-newline` memory) disappears for migrate — the Job uses the
  Cloud SQL binding, not an HTTP token. Update the `deploy-and-ralph-playbook` and
  `cicd-github-actions-wif` memories accordingly.

### DATABASE_URL Unix-socket format for Prisma
Current shape (CLAUDE.md "Environment Variables"):
`postgresql://USER:PASS@/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE`
**Prisma supports Unix-domain sockets** via the `host` query param pointing at the
socket directory — exactly this shape (libpq convention). Add `connection_limit`
(and optionally `pool_timeout`/`connect_timeout`) as extra query params (§4):
`postgresql://USER:PASS@localhost/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE&connection_limit=5`
- Note the `host=` value is a **directory** (the Cloud SQL socket dir), and Prisma/
  libpq appends `/.s.PGSQL.5432`. The existing string already works for `pg`, so the
  same `?host=/cloudsql/…` works for Prisma. **Verify in staging** before cutover
  (low risk; Risk #5). Do NOT switch to TCP — org policy blocks public IP.
- If Prisma ever rejects the bare form, URL-encode the `host` value; do not change
  transport.

---

## 4. PrismaClient singleton — preserving lazy / build-without-DB behavior

### The constraint to preserve
`db.ts:5-18` lazily constructs the `Pool` on first `query()` (NOT at import) and throws
loudly if `DATABASE_URL` is missing, because a module-level throw breaks `next build`
(Next imports route modules without a live DB — CLAUDE.md "Gotchas: db.ts must
lazy-init"). **PrismaClient must not connect or throw at import time, and must keep the
crash-loud `DATABASE_URL` check.**

`new PrismaClient()` does **not** connect eagerly (it connects on first query), so a
module-level instance is build-safe *as long as the generated client exists at build
time* (so `prisma generate` must run first — §5). To stay faithful to the existing
lazy+validate behavior, wrap it:

```ts
// src/lib/db.ts  (proposed — replaces the pg Pool entirely)
import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined
}

let client: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    // Crash loud — CLAUDE.md "No process.env without fallback validation".
    throw new Error("DATABASE_URL is not set — check Secret Manager binding on Cloud Run")
  }
  if (!client) {
    client = globalThis.__prisma__ ?? new PrismaClient()
    if (process.env.NODE_ENV !== "production") globalThis.__prisma__ = client
  }
  return client
}

// Optional convenience: a lazy proxy so `prisma.user.findMany()` works while the
// getter (and the DATABASE_URL check) stays lazy. Importing this module during
// `next build` does nothing until first property access.
export const prisma = new Proxy({} as PrismaClient, {
  get: (_t, prop) => (getPrisma() as unknown as Record<string | symbol, unknown>)[prop],
})
```

- **Remove the default export.** Today `seed/route.ts:3` does
  `import getPool from "@/lib/db"`. After the port, the seed uses
  `prisma.$transaction(...)` (§6), so the default `getPool` export is deleted. Grep to
  confirm nothing else imports the default.
- **Remove `query`, `Pool`, `pg` imports** once all 16 files are ported (Phase 4.6).
- The `globalThis` cache prevents dev hot-reload from spawning many clients (standard
  Prisma + Next pattern). In prod a single module instance is fine.
- **Choose one import style and be consistent:** either the `prisma` proxy everywhere,
  or `getPrisma()` at each call site. The proxy minimizes churn; `getPrisma()` is more
  explicit. Either is fine — do not mix.

### Cloud Run connection pooling
- Each warm Cloud Run instance holds its own `PrismaClient` → its own pool. Cloud SQL
  (PG15) has a finite `max_connections`. Today's `pg` pool caps at `max: 5`
  (`db.ts:12`).
- Prisma's default `connection_limit` on a long-running server is
  `num_physical_cpus * 2 + 1`, which on Cloud Run can exceed intent. **Pin it
  explicitly to 5** to match today's footprint: append `&connection_limit=5` to
  `DATABASE_URL` (a Secret Manager value change on the service — coordinate with the
  secret owner; not a repo change).
- **Budget:** `max_connections` ≥ (peak concurrent Cloud Run instances ×
  `connection_limit`) + headroom for the migrate Job and `/api/seed`. Confirm the
  instance's `max_connections` (Q6). With `connection_limit=5`, e.g. 10 warm instances
  = 50 connections + a couple for the Job/seed.
- A pooler (PgBouncer / Cloud SQL pooler) is a **phase-2** consideration; that's when
  `directUrl` earns its keep (migrations bypass the pooler). Not needed phase 1.

---

## 5. Dockerfile / build changes

The prod image is a **standalone Next.js bundle** (`next.config.mjs:4`
`output: "standalone"`). The runner stage copies only `public`, `.next/standalone`,
and `.next/static` (`Dockerfile:27-29`) and does **not** ship root files. Build is on
**`node:20-alpine`** (`Dockerfile:1`) with `libc6-compat` (`Dockerfile:5`) — **musl
libc** (do NOT be misled by the local Node v22/glibc/arm64 dev machine; engines target
the runtime). Prisma needs at runtime: the **generated client**, the **query-engine
binary** for linux-musl, and (for the migrate Job) the **migration engine +
`prisma/` folder**. Changes:

1. **`prisma generate` must run during build AND before `tsc`.** Add
   `"postinstall": "prisma generate"` to `package.json` scripts. This runs at the end
   of every `npm ci` — including the Dockerfile `deps` stage (`Dockerfile:8`) **and**
   the CI `npm ci` (`ci.yml:43`), so the generated client exists before
   `npx tsc --noEmit` (`ci.yml:46`) and before `npm run build` (`ci.yml:56`,
   `Dockerfile:16`). **Without this, `tsc` fails** (no `@prisma/client` model types).
   - **Guard:** `postinstall` runs `prisma generate`, which **requires
     `prisma/schema.prisma` to exist** — otherwise `npm ci` fails. Ensure the schema
     is committed in the same change that adds the dep (§7 Phase 1+2 ordering).
   - Defensive: also prepend to `build` (`"build": "prisma generate && next build"`)
     so a manual `next build` without a prior install still works.

2. **`binaryTargets` for the musl runtime.** In `prisma/schema.prisma`:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
   }
   ```
   `node:20-alpine` ships OpenSSL 3, so `linux-musl-openssl-3.0.x` is correct.
   `"native"` covers the dev laptop. If you see "Query engine binary for current
   platform could not be found" at runtime, the target string is wrong — this is the
   single most common Prisma-on-Alpine failure. **Verify the engine file is present in
   the built image** (§10).
   - *Alternative:* switch the base to `node:20-slim` (Debian/glibc) +
     `debian-openssl-3.0.x` — simpler engine story, larger image. Decision Q2.
     Keep Alpine unless engine issues prove intractable.

3. **Get the engine + client into the standalone bundle.** Next's standalone tracing
   often misses Prisma's **engine binary** (a native file, not JS). Do **both** (belt
   and suspenders):
   - In `next.config.mjs`, **merge** into the existing `experimental` block (do NOT
     touch `serverActions.allowedOrigins` / `bodySizeLimit` — Ralph guardrail,
     `next.config.mjs:9-16`):
     ```js
     experimental: {
       serverActions: { /* unchanged */ },
       outputFileTracingIncludes: {
         "*": [
           "./node_modules/.prisma/client/*.node",
           "./node_modules/.prisma/client/schema.prisma",
         ],
       },
     }
     ```
     > Note: in Next 14.2 `outputFileTracingIncludes` is still under `experimental`
     > (it graduated to top-level in Next 15). This repo is Next `14.2.35`
     > (`package.json:15`), so keep it under `experimental`.
   - AND add to the **runner** stage of the Dockerfile (after `Dockerfile:29`):
     `COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma`
     (and, if the standalone trace drops `@prisma/client`, also copy
     `/app/node_modules/@prisma/client`). Verify the engine `.so`/`.node` is present
     in the image.

4. **Migrate-Job image (§3 Option A).** The Job needs the Prisma CLI (`prisma`
   devDep), the migration engine, `prisma/schema.prisma`, and `prisma/migrations/`.
   Simplest: a small extra Dockerfile stage that keeps `node_modules` (incl. dev
   deps) + the `prisma/` dir and whose entrypoint is `npx prisma migrate deploy`.
   Ensure `prisma/` is copied into that stage. (You cannot reuse the lean `runner`
   stage — it strips dev deps and root files.)

5. **`.dockerignore`** (verified contents: `node_modules`, `.next`, `.git`,
   `.env*`, `skills`, `Dockerfile`, `.dockerignore`, etc.). The new `prisma/`
   directory is **not** excluded — good. The `builder` stage does `COPY . .`
   (`Dockerfile:14`), so `prisma/` is included there. Double-check after adding it.

---

## 6. Full inventory of raw-SQL call sites to port

**Verified:** 16 files import `@/lib/db`; **exactly 50** `query(` call sites. Grouped
by feature with porting order (lowest-risk → highest-risk). Per-file counts are exact.

### Tier 0 — infra / read-only (port first, easy to verify)
| # | File | `query()` | Notes |
|---|---|---|---|
| 1 | `src/app/api/health/route.ts` | 1 | `await query("SELECT 1")` (`:6`). Port to `await getPrisma().$queryRaw\`SELECT 1\``. Smoke test for the client + engine. |
| 2 | `src/lib/queries.ts` | 3 | `fetchPosts` (`:13-36`), `fetchUserSchool` (`:43-49`), `fetchRecentUsers` (`:55-61`). **`fetchPosts` is the trickiest read** — dynamic `cte`/`where`/`params` + correlated `like_count`/`liked_by_me`/`comment_count` subqueries (`:22-32`). See exceptions. The other two are trivial typed reads. |
| 3 | `src/lib/directory.ts` | 0 | **No `query()`** — a pure builder that returns a parameterized SQL `where` string + `params` (`:32-81`), consumed by the feed/directory readers. With Prisma it should return a typed `Prisma.UserWhereInput` object instead, OR be retired if its consumers move to `$queryRaw`. Keep the existing pure unit test green (rewrite it for whichever shape you pick). |
| 4 | `src/app/(main)/directory/page.tsx` | 1 | uses `query<DirectoryRow>` with the `buildUserSearch` fragment. Port alongside `directory.ts`. |
| 5 | `src/app/api/avatar/[id]/route.ts` | 1 | reads `avatar`/`avatar_mime` `bytea` (`:19-25`), serves via `new Uint8Array(row.avatar)` (`:29`). Prisma returns `avatar` as `Buffer`; `new Uint8Array(buffer)` works unchanged. **Verify-only**, not a risk. |

### Tier 1 — auth & profile reads (port next)
| # | File | `query()` | Notes |
|---|---|---|---|
| 6 | `src/lib/auth.ts` | 1 | `SELECT * FROM users WHERE email = $1` (`:17`). **Lives in node-only `auth.ts`, NOT `auth.config.ts`** — keep it there (edge boundary). Port to `prisma.user.findUnique({ where: { email } })`. The `User` shape consumed (`user.id/username/email/password_hash`, `:18-24`) maps to the Prisma `User` model fields. |
| 7 | `src/app/(main)/profile/[username]/page.tsx` | 1 | profile read by username. |
| 8 | `src/app/(main)/profile/[username]/edit/page.tsx` | 1 | edit-form prefill read. |

### Tier 2 — simple mutations (mirror the poke pattern)
| # | File | `query()` | Notes |
|---|---|---|---|
| 9 | `src/app/(auth)/register/actions.ts` | 1 | INSERT user (`:38-41`). Keep `{ error?: string }` return + `redirect()` **outside** try/catch (`:51`). **Replace the pg `code === "23505"` check (`:43`) with Prisma `P2002`** (unique violation) for duplicate email/username. |
| 10 | `src/app/(main)/feed/actions.ts` | 5 | create post (`:23`), like check/delete/insert (`:49,54,59`) — a read-then-write toggle, NOT an upsert; port faithfully (or use `prisma.like.delete`/`create` guarded), comment insert/read (`:93,117`). |
| 11 | `src/app/(main)/pokes/actions.ts` | 4 | **canonical upsert.** `ON CONFLICT (poker_id,pokee_id) DO UPDATE SET created_at = now(), acknowledged = false` (`:26-29,78-81`), count (`:51`), acknowledge (`:107`). Port to `prisma.poke.upsert({ create, update: { createdAt: new Date(), acknowledged: false } })`. **The `update` branch must explicitly set `createdAt`/`acknowledged`** — Prisma won't auto-bump them. Port this carefully; taunts/relationships/friendships mirror it. |
| 12 | `src/app/(main)/taunts/actions.ts` | 4 | fork of pokes + **cross-school guard** (rejects same-school; taunts only between *different* schools). Same upsert shape. |
| 13 | `src/app/(main)/messages/actions.ts` | 2 | send DM (insert), mark read (update). |

### Tier 3 — complex mutations / relations (port last)
| # | File | `query()` | Notes |
|---|---|---|---|
| 14 | `src/app/(main)/friends/actions.ts` | 6 | request/confirm friendship with symmetric-edge logic: reverse-row check (`:30`), confirm (`:35,40`), `ON CONFLICT DO NOTHING` insert (`:40-43`), reads + pending counts (`:127,151,166,193,215`). Composite-PK upserts. |
| 15 | `src/app/(main)/profile/actions.ts` | 9 | **largest mutation surface:** updateProfile (`:87`), relationship propose (delete-then-upsert, `:191-200`) / confirm, wall posts (`:235,270`), relationship/wall reads (`:294,316,348,366`), avatar `bytea` write `UPDATE users SET avatar=$1,avatar_mime=$2` (`:413`). Multiple `ON CONFLICT` upserts — same care as pokes. |
| 16 | `src/app/api/seed/route.ts` | 13 | **the big one.** A single manual `BEGIN/COMMIT` (`:669,844`) via the **default** `getPool().connect()` import (`:3,667`). Inserts **17** demo users (the in-file comment says "~9" but the array has 17 — verified) + posts/follows/likes/comments/wall_posts/pokes/taunts/relationships/friendships/messages, threading generated UUIDs via `RETURNING id` (`:685,718`), `ON CONFLICT` upserts (`:733,746,784,796,808,821`), and **`now() - ($n \|\| ' hours')::interval`** timestamp math (`:720,773,838`). Port: wrap in `prisma.$transaction(async (tx) => { … })` (interactive transaction so you can read back created ids), and **compute the interval timestamps in JS** — `new Date(Date.now() - offsetHours * 3_600_000)` — passed as `createdAt`. The first `DELETE FROM users WHERE email LIKE '%@demo.sml'` (`:672`) → `tx.user.deleteMany({ where: { email: { endsWith: "@demo.sml" } } })` (cascades preserved by FK `ON DELETE CASCADE`). **Highest-effort file — do it last.** |

### Exceptions — where raw SQL may stay (`prisma.$queryRaw` / `$executeRaw`)
- **`queries.ts` `fetchPosts`:** the dynamic `cte`/`where`/`params` plus three
  correlated count subqueries (`queries.ts:22-32`) are expressive in SQL. Porting to
  Prisma `_count` / relation filters + a `liked_by_me` via `some` is doable but
  changes the query shape and the `PostWithAuthor` projection. **Recommendation: keep
  it as a single typed `prisma.$queryRaw<PostWithAuthor[]>\`…\`` (parameterized).**
  Prisma fully supports parameterized raw SQL, so "Prisma" does not force losing this.
  This also means `directory.ts`'s `buildUserSearch` can keep producing SQL fragments
  consumed by a `$queryRaw` feed/directory query — **least churn, lowest semantic
  risk** for the trickiest read. Flag the choice in PR review (Q3).
- **DB defaults** (`gen_random_uuid()`, `now()`) stay as schema `@default(...)`, so
  inserts don't supply them — identical to today.
- Using `$queryRaw` does NOT reintroduce the pg Pool — it runs through the Prisma
  client/engine. `src/lib/db.ts` still exports only Prisma.

---

## 7. Step-by-step sequenced process

> Each phase ends green (`tsc` + `build`, DB-less). Commit per phase. The pre-push
> `qa-runner` reads CLAUDE.md, so Phase 0 lands first or it may object.

**Phase 0 — Unblock the guardrails (MUST be first).**
- 0.1 **CLAUDE.md:** flip "Coding Standards → No ORM. Use raw SQL via `pg`" and
  "Never Do This → No ORM. No Prisma, Drizzle, TypeORM" to permit Prisma; rewrite the
  workflow (schema in `prisma/schema.prisma`; migrations via `prisma migrate deploy`
  in a Cloud Run Job inside the VPC; client via `src/lib/db.ts` `getPrisma()`).
  Update "Database Schema", "Gotchas", "Testing & QA Gate" (note `prisma generate`
  runs before `tsc`).
- 0.2 **`ralph/PROMPT.md` line 18** ("Raw `pg` only, no ORM…") and **line 20** ("One
  Pool via `query()`…") → Prisma equivalents, so future Ralph iterations don't revert.
  (Verified those exact lines exist.)
- 0.3 The pre-push hook runs `qa-runner` (reads CLAUDE.md). Land 0.1/0.2 cleanly
  first; for the docs-only commit you *may* `git push --no-verify` (CLAUDE.md allows
  it for trivial/docs changes), but prefer landing it through the gate.
- **Why first:** otherwise the autonomous QA/Ralph agents treat Prisma as a rule
  violation and revert it.

**Phase 1 — Install + scaffold schema (same commit).**
- 1.1 `npm i -D prisma` and `npm i @prisma/client`. **Do NOT** `npm audit fix --force`
  (CLAUDE.md). Commit the lockfile.
- 1.2 Create `prisma/schema.prisma` (datasource `postgresql`,
  `url = env("DATABASE_URL")`, generator `binaryTargets` per §5; **no `directUrl` in
  phase 1**). Add `"postinstall": "prisma generate"` to `package.json`.
- **Order guard:** add the dep, the `postinstall` script, AND a valid
  `prisma/schema.prisma` in the **same commit** so no intermediate state has
  `postinstall` running `prisma generate` with no schema (which would break `npm ci`).

**Phase 2 — Schema source of truth + baseline migration.**
- 2.1 Throwaway local Postgres; apply the current `SCHEMA` string
  (`migrate/route.ts:8-130`).
- 2.2 `prisma db pull` against it → `schema.prisma`. Hand-tune per §2 (relations,
  `@map`/`@@map`, `@db.Uuid`/`@db.Timestamptz`/`@db.ByteA`, composite `@@id`).
- 2.3 Generate `prisma/migrations/0_init/migration.sql` (via `migrate diff` or
  `migrate dev --create-only`). **Hand-append the four `char_length<=280` CHECKs and
  the two `<>` self-reference CHECKs** (§2 baseline step 2).
- 2.4 `prisma generate` → typed client. Commit `prisma/` + lockfile.

**Phase 3 — Prisma client singleton.**
- 3.1 Replace `src/lib/db.ts` internals with `getPrisma()`/`prisma` (§4), keeping the
  crash-loud `DATABASE_URL` check. **Remove the default `getPool` export** (the seed
  is ported in Phase 4.4, so coordinate or temporarily keep a stub until then).
- 3.2 Append `&connection_limit=5` to the `DATABASE_URL` secret (service-level value
  change, not repo). Coordinate with the secret owner.

**Phase 4 — Port call sites (lowest-risk first, §6 tiers).**
- 4.1 Tier 0. After each file: `tsc` + `build`.
- 4.2 Tier 1 — re-verify the edge boundary: grep that `auth.config.ts` and
  `middleware.ts` import **no** Prisma.
- 4.3 Tier 2 — map `ON CONFLICT` → `upsert` (explicit `update` branch fields,
  §6 #11), pg `23505` → Prisma `P2002`; preserve `{ error?: string }` + `redirect()`
  placement.
- 4.4 Tier 3 — friends, profile/actions, **seed** (`$transaction`, interval math in
  JS, `deleteMany` with `endsWith`).
- 4.5 Decide per §6 which reads stay `$queryRaw` (recommended: `fetchPosts`, and the
  directory query that consumes `buildUserSearch`).
- 4.6 Remove `pg` + `@types/pg` from `package.json` once nothing imports them; delete
  the old pool code. Keep `bcryptjs` (unrelated).

**Phase 5 — Production migration wiring.**
- 5.1 Build the migrate-Job image/stage (§5.4) and create the Cloud Run Job (§3
  Option A) with `--add-cloudsql-instances` + `DATABASE_URL` secret; grant the Job's
  runtime SA `roles/cloudsql.client` (Q5/Q7).
- 5.2 **Baseline prod:** run `prisma migrate resolve --applied 0_init` once, inside
  the VPC (via the Job or Cloud Shell + Auth Proxy), so the existing DB is marked
  migrated without re-running DDL (data untouched). **Do this before any
  `migrate deploy`.**
- 5.3 Update **`deploy.yml:173-186`** ("Apply DB migration") to
  `gcloud run jobs execute <migrate-job> --wait …` instead of the `curl …/api/migrate`
  at `:185-186`. Drop the MIGRATE_TOKEN newline handling for migrate.
- 5.4 Retire `/api/migrate`: delete `src/app/api/migrate/route.ts` + the `SCHEMA`
  string. Update the `deploy-and-ralph-playbook` and `cicd-github-actions-wif`
  memories.
- 5.5 `/api/seed` stays an HTTP route (now using the Prisma client), still
  token-guarded; CD intentionally does **not** run it (destructive) — unchanged policy.

**Phase 6 — Verify (§10 checklist).**

---

## 8. Doc / config updates required

| File | Change |
|---|---|
| `CLAUDE.md` | Remove ORM ban (Coding Standards + "Never Do This"); document Prisma schema location, `getPrisma()` rule, `prisma migrate deploy` via Cloud Run Job in-VPC, `prisma generate` runs before `tsc`/build, updated "Database Schema" + "Gotchas". |
| `ralph/PROMPT.md` | **Line 18** ("Raw `pg` only, no ORM…") and **line 20** ("One Pool via `query()`…") → Prisma equivalents. |
| `package.json` | Add `prisma` (devDep) + `@prisma/client` (dep); scripts `"postinstall": "prisma generate"`, `"build": "prisma generate && next build"`, `"db:migrate:dev": "prisma migrate dev"`, `"db:migrate:deploy": "prisma migrate deploy"`. Remove `pg` + `@types/pg` at end of Phase 4. |
| `prisma/schema.prisma` | New. Datasource + generator (`binaryTargets`), 11 models, composite `@@id`, named relations, `@db.*` native types. No `directUrl` in phase 1. |
| `prisma/migrations/0_init/migration.sql` | New. Introspected DDL + hand-appended CHECK constraints. |
| `next.config.mjs` | Merge `experimental.outputFileTracingIncludes` for the Prisma engine; **do NOT touch `serverActions`** (`:9-16`). |
| `Dockerfile` | `prisma generate` via `postinstall` (auto on `npm ci`); `COPY node_modules/.prisma` into runner stage; add a migrate-Job stage (§5.4). |
| `.github/workflows/deploy.yml` | Replace `/api/migrate` curl (step `:173-186`, curl at `:185-186`) with `gcloud run jobs execute`. `ci.yml` needs no edit — `postinstall` covers `prisma generate` on `npm ci` before `tsc`/build. |
| memory: `deploy-and-ralph-playbook.md`, `cicd-github-actions-wif.md`, `nextauth-secret-trailing-newline.md` | Update migrate-flow refs (no more `/api/migrate` token curl; `/api/seed` still token-curl). |
| `schema.sql` (root) | Verified 46 lines, stale (predates `messages`/`friendships`/`class_year`/avatar). **Recommendation: delete** to avoid a third source of truth. |

---

## 9. Risks, rollback, open questions

### Risks
1. **Guardrail revert (highest).** Skipping Phase 0 → the `qa-runner` pre-push hook
   and any Ralph run treat Prisma as a violation. Mitigation: Phase 0 first.
2. **`tsc` fails before generate.** `ci.yml` runs `tsc` right after `npm ci`. Without
   `postinstall: prisma generate`, no model types exist → red CI. Mitigation: the
   `postinstall` script (and same-commit schema, §7 Phase 1 guard).
3. **Engine/platform mismatch on Alpine/musl.** Wrong `binaryTargets` → runtime
   "engine not found." Mitigation: `linux-musl-openssl-3.0.x`, verify engine file in
   image, smoke-test before traffic shift.
4. **Standalone bundle drops the engine.** Mitigation: `outputFileTracingIncludes`
   **and** explicit `COPY` (§5.3), verified.
5. **Connection exhaustion.** Many instances × default `connection_limit` > Cloud SQL
   `max_connections`. Mitigation: pin `connection_limit=5`, document the budget (§4),
   confirm `max_connections` (Q6).
6. **Unix-socket URL not accepted by Prisma.** Low probability (Prisma supports
   `?host=`), verify in staging before cutover (§3).
7. **Baseline goes wrong → migrate runs DDL against prod.** `0_init` is plain
   `CREATE TABLE` (no `IF NOT EXISTS`); if executed against prod it would **error**
   (not silently drop), blocking deploy. Mitigation: `migrate resolve --applied 0_init`
   **before any `migrate deploy`** (§5.2); never let `migrate deploy` precede the
   resolve.
8. **New infra/IAM for the Job.** The migrate Job needs Cloud SQL attached + its
   runtime SA holding `roles/cloudsql.client`; the deploy SA must be able to execute
   it. (The draft's "no new infra" was wrong.) Mitigation: provision + test in
   staging (Q5/Q7).
9. **`fetchPosts` semantics drift** if reworked into typed Prisma. Mitigation: keep as
   `$queryRaw` (§6), compare outputs against prod.
10. **Upsert update-branch fields** (`created_at = now()`, `acknowledged = false`)
    must be set explicitly in Prisma `update:` blocks; forgetting them silently
    changes behavior. Mitigation: §6 #11, plus the behavioral checks (§10).

### Rollback plan
- Prisma lands on a branch; the old `pg` path + `/api/migrate` + `SCHEMA` string stay
  until Phase 5 is proven.
- The baseline migration is a **no-op against the live DB** (marked applied, never
  executed), so **introducing Prisma changes no data** — rollback = redeploy the
  previous image (still has `/api/migrate` + `pg`).
- Cloud Run keeps prior revisions:
  `gcloud run services update-traffic <svc> --to-revisions=<prev>=100 --region=… --project=…`
  reverts instantly. (Also note: a deploy occasionally leaves the new revision at 0%
  traffic — `--to-latest` if needed; per `deploy-and-ralph-playbook` memory.)

### Open questions for the human
- **Q1.** Approve the migrate-execution mechanism: Cloud Run **Job** (recommended) vs
  keeping a token route vs Cloud Build VPC private pool? Affects infra/IAM.
- **Q2.** Keep Alpine base + musl engine, or switch to `node:20-slim` (glibc) for a
  simpler engine story at the cost of image size?
- **Q3.** May `fetchPosts` (and the directory query) stay `prisma.$queryRaw`, or must
  everything be the typed API? (Affects scope/effort — recommend allowing raw.)
- **Q4.** Phase-1 pooling: pin `connection_limit=5` only (recommended), or stand up a
  pooler now (then add `directUrl`)?
- **Q5.** Who runs the one-time `prisma migrate resolve --applied 0_init` inside the
  VPC, and which SA/identity (Cloud Shell + Auth Proxy, or the migrate Job)?
- **Q6.** Confirm Cloud SQL `max_connections` headroom for `connection_limit` × peak
  instances + migrate Job + seed.
- **Q7.** Provision the migrate Job's runtime SA with `roles/cloudsql.client` and
  confirm the deploy SA (`github-deployer@…`) can deploy/execute Cloud Run Jobs (it
  has `run.admin` + `iam.serviceAccountUser` — verify scope).

---

## 10. Verification checklist

Static / build:
- [ ] `npx prisma validate` passes; `prisma generate` produces a client.
- [ ] `npx tsc --noEmit` clean **after** `npm ci` (proves `postinstall` generated the
      client before typecheck). No `any`; types from Prisma or `src/lib/types.ts`.
- [ ] `npm test` (Vitest) green — pure-logic tests in `src/lib/` (incl. the rewritten
      `directory` builder test) pass.
- [ ] `npm run build` (DB-less) passes — proves the client doesn't connect/throw at
      import (lazy-init preserved).
- [ ] `auth.config.ts` and `middleware.ts` import **no** Prisma/`@prisma/client`
      (edge boundary) — grep to confirm.

Image / deploy:
- [ ] Prisma query-engine binary present in the standalone image (inspect
      `node_modules/.prisma/client` in the built image; `linux-musl-openssl-3.0.x`).
- [ ] Container boots on Cloud Run; first query connects (no "engine not found", no
      "DATABASE_URL not set").
- [ ] Migrate Job runs `prisma migrate deploy`, reaches Cloud SQL over the socket,
      reports up-to-date.

Migration / data:
- [ ] `prisma migrate resolve --applied 0_init` recorded **before** any deploy;
      `prisma migrate status` reports "up to date" with **zero** pending DDL executed.
- [ ] Row counts before == after for all 11 tables (demo data intact). Spot-check a
      demo login (`<user>@demo.sml` / `demo1234`).
- [ ] `prisma migrate deploy` is idempotent — re-running is a no-op.

Behavioral (every ported endpoint returns identical data):
- [ ] `GET /api/health` OK.
- [ ] Login (`authorize`) succeeds for demo creds; bad creds → graceful `null`, not
      500.
- [ ] Register a new user (duplicate email/username → `P2002` → `{ error }`, no throw,
      redirect on success).
- [ ] Feed: posts with correct `like_count` / `liked_by_me` / `comment_count`; create
      post; like/unlike toggle; comment.
- [ ] Profile read + edit (incl. avatar upload `bytea` write at `profile/actions.ts:413`
      and `GET /api/avatar/[id]` serve round-trip — Buffer in/out).
- [ ] Pokes / Taunts (cross-school guard) / Friends (confirm + mutual counts) /
      Relationships (propose/confirm) / Messages (send + unread badge) — note upsert
      `update`-branch fields (`created_at`, `acknowledged`) behave as before.
- [ ] Directory search filters return the same rows as the raw-SQL version.
- [ ] `POST /api/seed` (token-guarded) runs in one `$transaction`, wipes `@demo.sml`,
      reinserts 17 users + posts/follows/likes/comments/wall_posts/pokes/taunts/
      relationships/friendships/messages, returns the same counts.
