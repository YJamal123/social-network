# V2 Migration — RESUME STATE (checkpoint before computer restart)

_Last updated: 2026-06-18, before an Auth0 implementation run that was NOT started._

## TL;DR for picking back up
- **Independent verification pair run 2026-06-18: Prisma = PASS, Auth0 = PASS-WITH-NOTES.**
  Reports: `prisma-verify-report.md`, `auth0-verify-report.md`. Gates green on both
  (tsc clean, 64/64 tests, DB-less build). Live credentials login re-verified working.
  No open security findings. Only non-blocking notes: pin `connection_limit=5` (LOW);
  the auth0_sub unique index is full not partial (benign on PG15). Remaining work is
  human-only: 2 Auth0-dashboard toggles + a browser test of Google sign-in.
- **Prisma ORM migration: DONE & DEPLOYED & VERIFIED.**
- **Auth0 migration: DONE & DEPLOYED & VERIFIED** (2026-06-18). NextAuth v5 +
  Auth0 OIDC provider with the bcrypt credentials fallback retained; `/onboarding`
  gate; `auth0_columns` migration applied in prod; rev `mdjamal-app-00027-58z` at
  100% traffic. Full report: `auth0-impl-progress.md`. Remaining: 2 manual
  Auth0-dashboard toggles (enable Google + DB connection) and a browser test of
  Google end-to-end — see that report. Credentials login (`@demo.sml`/`demo1234`)
  verified still working live.
- All work lives on local branch **`feat/v2-prisma-auth0`** — **NOT pushed to GitHub.**

## Git state
- Branch: `feat/v2-prisma-auth0` (created off the CI branch HEAD).
- Prisma agent made **6 local commits** here. Nothing pushed.
- To resume: `git checkout feat/v2-prisma-auth0`. Commits + working files survive a restart.

## What is DONE (Prisma track)
- Raw `pg` fully replaced by Prisma. `pg` removed from deps. No `query()`/`getPool` left.
- Prisma client exported from `@/lib/db` as `{ getPrisma }` / `{ prisma }` — lazy, preserves DB-less `next build`. NEVER import it into `auth.config.ts`/`middleware.ts` (edge).
- Schema introspected → baselined non-destructively: migration `0_init` marked `--applied` (no DDL on live data).
- **Migrations now run via Cloud Run Job `mdjamal-migrate`** (runtime SA has `roles/cloudsql.client`, VPC egress to private-IP Cloud SQL). This replaces the old `/api/migrate` route, which was **DELETED**.
- `/api/seed` STILL EXISTS, now Prisma-backed (`$transaction`), still token-guarded (needs the trailing-newline, URL-encoded `NEXTAUTH_SECRET` token).
- Deployed: revision **`mdjamal-app-00026-q56`**, 100% traffic. Gates green (tsc clean, 64/64 tests, DB-less build). Live verified: health ok, demo login `thefacebook_tom@demo.sml`/`demo1234` works, feed/profile/avatar/directory/pokes/taunts/messages/friends/relationships all work, seed returns full counts. Demo data intact.
- `CLAUDE.md` and `ralph/PROMPT.md` updated to ALLOW Prisma (ORM ban removed) — Phase 0.

### Prisma deferred items (human / later)
- Pin `&connection_limit=5` on the `mdjamal-db-url` secret (recommended for Cloud Run; live secret left untouched).
- Host laptop disk is ~100% full (pre-existing) — broke local `docker build`; irrelevant because deploys use Cloud Build (remote). Worth clearing space.
- `git push` the branch when ready to trigger CD / open a PR.
- For any NEW raw SQL: Prisma binds strings as `text`, so cast uuid comparisons (`$n::uuid`).

## What is NOT done (Auth0 track) — START HERE NEXT SESSION
Almost nothing implemented. ONE partial head-start exists:
- **`prisma/schema.prisma` already contains the Auth0 columns** (committed as WIP
  `5925683`): `auth0Sub String? @unique @map("auth0_sub")`, `onboardedAt DateTime?
  @map("onboarded_at")`, and `username`/`passwordHash` relaxed to nullable.
- BUT: **no Prisma migration was generated**, the columns are **NOT in the live DB**,
  **no auth code is wired**, and **nothing was deployed**. The Auth0 agent must run
  `prisma migrate dev --name auth0_columns` to materialize the columns (they already
  match the schema, so it just emits the migration), then do all the auth wiring.

Prerequisites are READY:
- **Auth0 secrets already in Secret Manager (no trailing newline):**
  `mdjamal-auth0-domain` = `dev-afe77gumoeorof8u.us.auth0.com`,
  `mdjamal-auth0-client-id`, `mdjamal-auth0-client-secret`.
- Auth0 tenant/app provisioned by the human (Regular Web App, Next.js). Callback URL
  `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0` registered.
- Locked decisions in `DECISIONS.md`. Hardened plan in `auth0-final.md`.
- The exact agent launch prompt is saved in `auth0-impl-AGENT-PROMPT.md` — relaunch that verbatim (Opus 4.8) to do the Auth0 implementation, then run the verification pair.

### Manual Auth0-dashboard steps the human still owes (agent cannot do these — no Management API M2M creds)
1. In the Auth0 app, **enable the Google social connection** and the **Username-Password-Authentication database connection**.
2. (Optional) create a demo user in the DB connection — NOT required, because credentials fallback is retained so `@demo.sml`/`demo1234` already works via the existing bcrypt login.

## Resume checklist (next session)
1. `gcloud auth login` if creds lapsed (likely after a restart) — verify `gcloud config get-value account` = `md@smlcrm.com`, project `sml-interview-sandbox`.
2. `git checkout feat/v2-prisma-auth0`.
3. Relaunch the Auth0 implementation agent using `auth0-impl-AGENT-PROMPT.md` (Opus 4.8).
4. Then launch the verification pair (Prisma-verify + Auth0-verify, parallel, Opus 4.8).
5. Do the 2 manual Auth0-dashboard steps above before expecting Google login to work.

## Files in this folder
- `prisma-final.md`, `auth0-final.md` — hardened plans (post-critique).
- `prisma-draft.md`, `auth0-draft.md` — original drafts.
- `DECISIONS.md` — locked human decisions.
- `prisma-impl-progress.md` — full Prisma implementation report.
- `auth0-impl-AGENT-PROMPT.md` — the ready-to-relaunch Auth0 agent prompt.
- `STATE.md` — this file.
