# V2 Migration — Locked Decisions

These were decided by the human (Md) on 2026-06-18. The implementation and verification
agents MUST follow these. They resolve the open questions left in `prisma-final.md` and
`auth0-final.md`.

## Auth0

- **Tenant & credentials:** Human provisions the Auth0 tenant + Regular Web Application
  manually and hands over `Domain`, `Client ID`, `Client Secret`. These go into Secret
  Manager as `mdjamal-auth0-domain`, `mdjamal-auth0-client-id`, `mdjamal-auth0-client-secret`
  (watch the trailing-newline trap — pipe straight in, do not use `$(...)` capture).
  → Auth0 implementation agent assumes these secrets exist / will be wired to Cloud Run.

- **SDK:** NextAuth v5 + Auth0 as an OIDC provider (Option B in `auth0-final.md`). Do NOT
  use `@auth0/nextjs-auth0`.

- **Reviewer login = BOTH.** Support a seeded Auth0 **Database connection** user
  (keep `<username>@demo.sml` / `demo1234`) AND Google sign-in. Seed route must create the
  demo user in the Auth0 DB connection as well as the local `users` row.

- **Credentials fallback = YES.** Keep the existing NextAuth credentials + bcrypt login
  working ALONGSIDE Auth0 OIDC for this transition release. Do not delete
  `password_hash` / bcrypt yet. Both paths must produce the same `users.id` session identity.

- Required onboarding fields still captured post-login: `username`, `school`
  (validated vs `src/lib/schools.ts`), `class_year`. First-login provisioning must be
  race-safe (`INSERT ... ON CONFLICT (auth0_sub)`); link-by-email only when
  `email_verified` is true.

## Prisma

- **Migration execution = Cloud Run Job inside the VPC** running `prisma migrate deploy`.
  Provision a service account with `roles/cloudsql.client` and attach the Cloud SQL
  instance. Retire the hand-maintained `/api/migrate` SCHEMA-string path once the Job works.

- Follow `prisma-final.md` for everything else: introspect-then-baseline (`--applied`,
  non-destructive), musl `binaryTargets`, lazy PrismaClient (preserve build-without-DB),
  `postinstall: prisma generate` committed in the SAME change as `schema.prisma` (CI runs
  `tsc` before `next build`), read-only queries may stay `$queryRaw`.

## Cross-cutting (do FIRST)

- **Phase 0:** Update `CLAUDE.md` and `ralph/PROMPT.md` to remove the ORM ban BEFORE any
  Prisma code lands, or the pre-push `qa-runner` hook and the Ralph loop will revert it.
- Human runs `gcloud auth login` before agents make gcloud calls (creds lapse on long sessions).
- Repo is public — secrets only via Secret Manager, never committed.
