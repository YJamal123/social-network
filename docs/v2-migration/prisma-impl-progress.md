# Prisma ORM Migration — Implementation Progress & Handoff

**Status: DONE.** Prisma fully replaces raw `pg`. Built on Cloud Build, deployed to
Cloud Run (revision `mdjamal-app-00026-q56`, 100% traffic), prod DB baselined
non-destructively, and verified end-to-end on the live URL with demo data intact.

Branch: `feat/v2-prisma-auth0`. All work is **local commits only** (no `git push`).

---

## What changed (by area)

### Phase 0 — Guardrails (commit `a96123e`)
- `CLAUDE.md`: removed the "No ORM" bans (Coding Standards + Never Do This); documented
  Prisma schema location, `getPrisma()` rule, migrate-via-Cloud-Run-Job, `prisma generate`
  before `tsc`/build, musl `binaryTargets`, the engine-in-standalone-bundle gotcha, and the
  edge boundary now keeping `@prisma/client` (not `pg`) out of `auth.config.ts`/`middleware.ts`.
- `ralph/PROMPT.md`: lines 18 & 20 rewritten to Prisma equivalents so the Ralph loop and the
  pre-push `qa-runner` (which reads CLAUDE.md) don't revert Prisma.

### Phase 1+2 — Schema + baseline migration (commit `b465429`)
- `prisma/schema.prisma`: 11 models. **Verified faithful** to the legacy `SCHEMA` string by
  standing up a throwaway PG15 (Docker), applying the old SCHEMA, and running
  `prisma migrate diff` — **zero structural diffs** (only Prisma's FK drop/recreate
  normalization). Snake_case via `@map`/`@@map`; `@db.Uuid` / `@db.Timestamptz(6)` /
  `@db.ByteA`; composite `@@id`; named self-relations; `binaryTargets =
  ["native","linux-musl-openssl-3.0.x"]`; **no `directUrl`** (no pooler in phase 1).
- `prisma/migrations/0_init/migration.sql`: from-empty DDL + `CREATE EXTENSION pgcrypto` +
  hand-appended `CHECK` constraints Prisma can't model (4× `char_length(content)<=280`, 2×
  `<>` self-reference). Proven to apply cleanly to a fresh DB and round-trip diff-clean.
- `package.json`: `@prisma/client` dep + `prisma` devDep; scripts `postinstall: prisma
  generate` (so the client exists before `tsc` in CI), `build: prisma generate && next build`,
  `db:migrate:dev`, `db:migrate:deploy`. `schema.sql` (stale) deleted.

### Phase 3+4 — Client singleton + all call sites (commit `7b9a01f`)
- `src/lib/db.ts`: pg Pool → lazy `PrismaClient` (`getPrisma()` + a `prisma` proxy). Keeps the
  crash-loud `DATABASE_URL` check and build-without-DB behavior (no connect/throw at import).
  Default `getPool` export removed. **`getPrisma()` is the import path the next agent should use.**
- All **16** files ported; no `pg`/`getPool` import remains. `pg` + `@types/pg` removed.
  - Mutations → typed Prisma. `ON CONFLICT DO UPDATE` → `upsert` with the update branch
    reproduced by hand (pokes/taunts/relationships/friendships set `createdAt: new Date()` +
    `acknowledged`/`confirmed`/`status`; Prisma does NOT auto-bump). `ON CONFLICT DO NOTHING`
    → `upsert({update:{}})`. Unconditional `UPDATE/DELETE … WHERE` → `updateMany`/`deleteMany`
    (a missing row stays a silent no-op; `update()` would throw P2025). pg `23505` →
    Prisma `P2002` in register.
  - Reads with joins/CTEs/correlated subqueries kept as parameterized `$queryRaw` /
    `$queryRawUnsafe` (fetchPosts, directory, profile aggregates, conversations, getComments,
    pokers/taunters, wall/relationship lists, head-to-head). Simple reads → typed
    `findUnique`/`findMany`/`count`. `directory.ts` (pure SQL-fragment builder) untouched — its
    unit test stays green.
  - **CRITICAL — uuid casts:** Prisma binds string params as `text`, so every uuid-column
    comparison in raw SQL is cast `$n::uuid` (positional) or `${id}::uuid` (tagged). Without it:
    `ERROR: operator does not exist: uuid = text` (42883). Smoke-tested all raw queries against
    the throwaway DB **and** live in prod.
  - `seed/route.ts`: manual `BEGIN/COMMIT` via `getPool().connect()` → `prisma.$transaction`;
    `RETURNING id` → `create({select:{id}})`; `now()-($n||' hours')::interval` → JS
    `new Date(Date.now()-h*3.6e6)`; `DELETE … LIKE '%@demo.sml'` →
    `deleteMany({where:{email:{endsWith:"@demo.sml"}}})`. Still token-guarded HTTP route.
  - `auth.ts` `authorize` → `prisma.user.findUnique` (still node-only; edge boundary verified
    clean of Prisma).
- `/api/migrate` route + `SCHEMA` string **deleted** (retired in favor of the Job).

### Phase 5 — Build/deploy infra (commit `13c7bc5`)
- `Dockerfile`: `deps` stage COPYs `prisma/` before `npm ci` (postinstall needs the schema);
  runner stage COPYs `node_modules/.prisma` + `@prisma/client` (musl engine in the standalone
  bundle); new `migrate` stage (full node_modules incl. Prisma CLI + `prisma/`) with CMD
  `npx prisma migrate deploy`.
- `next.config.mjs`: merged `experimental.outputFileTracingIncludes` for the Prisma engine
  (`serverActions` block untouched — Ralph guardrail).
- `cloudbuild.yaml` (new): builds BOTH images (runner + migrate target) from the one Dockerfile
  and pushes them (driven by `_IMAGE`/`_MIGRATE_IMAGE` substitutions). Needed because
  `gcloud builds submit --tag` can only build the final stage.
- `.github/workflows/deploy.yml`: build via `cloudbuild.yaml` (two images); the
  `curl …/api/migrate?token=` step replaced by `gcloud run jobs update/execute mdjamal-migrate`.
  MIGRATE_TOKEN / trailing-newline handling for migrate is gone. (CI `ci.yml` needed no edit —
  `postinstall` covers `prisma generate` before `tsc`.)

---

## Exact migration mechanism built

- **Cloud Run Job `mdjamal-migrate`** (region `us-central1`, project `sml-interview-sandbox`).
  - Image: the Dockerfile `migrate` target. CMD `npx prisma migrate deploy`.
  - Runtime SA: `110062063496-compute@developer.gserviceaccount.com` (the same SA the service
    uses). **Granted `roles/cloudsql.client`** this run (project-level IAM binding).
  - Network: `--network=default --subnet=default --vpc-egress=private-ranges-only` +
    `--set-secrets=DATABASE_URL=mdjamal-db-url:latest`. **No `--add-cloudsql-instances`** — the
    app reaches Cloud SQL over its **private IP** (`172.31.0.3:5432`) via VPC egress, not a Unix
    socket (`DATABASE_URL` is a plain TCP URL). Prisma works with this unchanged.
- **One-time baseline (non-destructive):** ran `prisma migrate resolve --applied 0_init` via the
  Job → log: `Migration 0_init marked as applied.` The DDL was **never executed** against prod;
  demo data untouched. Then `prisma migrate deploy` → `No pending migrations to apply.`
  (idempotent, zero DDL).
  - Gotcha for future overrides: the alpine base entrypoint is `node`, so an `--args` override
    must start with `npx` (e.g. `--args=npx,prisma,migrate,resolve,--applied,<name>`).

---

## Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean (after `npm ci` → postinstall generated the client) |
| `npm test` (Vitest) | 64/64 pass (incl. untouched `directory` builder test) |
| `npm run build` (DB-less, `DATABASE_URL` unset) | passes — lazy-init preserved |
| `auth.config.ts` / `middleware.ts` import Prisma? | NO (edge boundary clean) |
| Cloud Build (runner + migrate images, musl) | SUCCESS |
| Migrate Job: baseline `resolve --applied 0_init` | success — marked applied, no DDL run |
| Migrate Job: `migrate deploy` | "No pending migrations to apply" (idempotent) |
| Deploy → revision `mdjamal-app-00026-q56` | serving 100% traffic |
| `GET /api/health` | `{"ok":true}` (Prisma client + musl engine + DB OK) |
| Credential login (`thefacebook_tom@demo.sml` / `demo1234`) | 302 + valid JWT session (id resolved) |
| `/feed` authed | renders demo posts ("directory live", etc.) |
| `/profile/harvardhannah` | username + bio + school + wall posts render (aggregate `$queryRaw`) |
| `/api/avatar/<id>` | `image/jpeg` 17185 bytes (bytea→Buffer round-trip) |
| `/directory?school=Cornell` | returns Cornell users (search fragment + `::uuid` cast) |
| `/pokes` `/taunts` `/messages` `/friends` `/relationships` | all HTTP 200 |
| `POST /api/seed` (ported `$transaction`) | `{ok:true, counts:{users:17,posts:81,follows:59,likes:60,comments:48,wallPosts:27,pokes:16,taunts:32,relationships:9,friendships:32,messages:38}}` |
| Demo login after re-seed (`harvardhannah`) | works; feed shows her posts |

**Demo data intact:** the baseline never touched it; the seed re-created it cleanly and counts
match the seed arrays.

---

## Deferred / needs human action

1. **`connection_limit=5` not pinned.** The plan recommends appending `&connection_limit=5` to
   the `DATABASE_URL` secret (`mdjamal-db-url`) to match the old pg `max:5` footprint. I did NOT
   modify the secret (it's a live service value; per DECISIONS, coordinate with the secret
   owner). Prisma's default limit is `num_cpus*2+1`; with `maxScale=20` instances this could
   pressure Cloud SQL `max_connections`. **Recommend the human append `&connection_limit=5`** to
   the secret and redeploy (no code change). Confirm `max_connections` headroom.
2. **`git push` not done** (not authorized this run). The branch has 5 local commits ahead.
   When pushed, the CD `deploy.yml` will build two images + run the migrate Job automatically.
   Re-verify the deploy.yml migrate step in CI on first push (the deploy SA has `run.admin`,
   which covers Jobs; it already has `iam.serviceAccountUser`).
3. **Local Docker build not run** — the host data volume is ~100% full (pre-existing; not caused
   by this work), so a local `docker build` ENOSPC'd. Irrelevant to deploy: Cloud Build (remote)
   built both images successfully. The throwaway PG container and Docker Desktop were stopped to
   reclaim space.

---

## Notes for the Auth0 implementation agent (runs next)

- **Prisma client import:** `import { getPrisma } from "@/lib/db"` then `getPrisma().user.…`,
  or `import { prisma } from "@/lib/db"`. Do NOT instantiate `PrismaClient` or import
  `@prisma/client` into `auth.config.ts` / `middleware.ts` (edge runtime).
- **Adding the auth columns (`auth0_sub`, `onboarded_at`, `class_year` is already present):**
  1. Edit `prisma/schema.prisma` — add the fields to `model User` (e.g.
     `auth0Sub String? @unique @map("auth0_sub")`, `onboardedAt DateTime? @map("onboarded_at") @db.Timestamptz(6)`).
  2. Author the migration against a throwaway DB: `npx prisma migrate dev --name auth0_columns`
     (needs a local Postgres; the `DATABASE_URL` in the gitignored `.env` points at one if still
     running — otherwise `docker run postgres:15` and apply `prisma/migrations/0_init` first).
     Commit `prisma/schema.prisma` + the new `prisma/migrations/<ts>_auth0_columns/` together.
  3. Prod apply happens automatically: the next deploy builds the migrate image and the
     `mdjamal-migrate` Job runs `prisma migrate deploy` (it will apply ONLY the new migration —
     `0_init` is already baselined). To run it by hand: `gcloud run jobs update mdjamal-migrate
     --image=<new-migrate-image> …` then `gcloud run jobs execute mdjamal-migrate --wait …`.
  4. For the race-safe first-login provisioning (`INSERT … ON CONFLICT (auth0_sub)`), use
     `prisma.user.upsert({ where: { auth0Sub }, create: {…}, update: {…} })` (add a
     `@@unique`/`@unique` on `auth0_sub` so the `where` compiles). Make `auth0Sub` `@unique`.
- **`/api/migrate` no longer exists.** `/api/seed` still exists (Prisma-backed, token-guarded)
  and is what the reviewer/seed flow depends on — keep it working. Per DECISIONS the seed must
  also create the demo user in the Auth0 DB connection; that's additive to the existing
  Prisma `$transaction`.
- **Credentials login still works** (unchanged strategy/bcrypt; just the DB read is Prisma now).
  Both paths must produce the same `users.id` session identity.
- **uuid-cast rule:** any NEW raw SQL comparing a uuid column to a string param must cast
  `$n::uuid` / `${id}::uuid`, or it errors with `operator does not exist: uuid = text`.
