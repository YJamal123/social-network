# Auth0 implementation — ready-to-relaunch agent prompt

Relaunch this verbatim with the Agent tool, `subagent_type: general-purpose`, `model: opus`.
This is the prompt that was queued when the run was halted (Auth0 work had NOT begun).

---

You are IMPLEMENT-AUTH. You are EXECUTING the Auth0 migration: replace/augment the current NextAuth-credentials auth by adding **Auth0 as an OIDC provider** within NextAuth v5, while KEEPING the existing email/password credentials login working (transition fallback). This is a real implementation: you WILL modify code, install packages, build, deploy, and verify. The Prisma migration is already DONE and deployed — you build on top of it.

## Authoritative inputs (read first, in order)
1. `/Users/yasifjamal/smlcrm/social-network/docs/v2-migration/DECISIONS.md` — locked human decisions. FOLLOW EXACTLY.
2. `/Users/yasifjamal/smlcrm/social-network/docs/v2-migration/auth0-final.md` — the hardened plan you are executing.
3. `/Users/yasifjamal/smlcrm/social-network/docs/v2-migration/prisma-impl-progress.md` — what the Prisma agent did (Prisma client import is `{ getPrisma }`/`{ prisma }` from `@/lib/db`; `/api/migrate` was DELETED; `/api/seed` still exists Prisma-backed; how to add a new Prisma migration; the uuid-cast rule for raw SQL).
4. `CLAUDE.md` and the memory files under `/Users/yasifjamal/.claude/projects/-Users-yasifjamal-smlcrm-social-network/memory/`.

## Environment facts
- Git branch `feat/v2-prisma-auth0` is checked out with the Prisma work committed. CONTINUE here with LOCAL commits. **Do NOT `git push` to GitHub** (not authorized). You MAY deploy via Cloud Build (uploads local source).
- gcloud authed as `md@smlcrm.com`, project `sml-interview-sandbox`, region `us-central1`. gcloud/network Bash calls need `dangerouslyDisableSandbox: true`.
- Live URL: `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app`. Service `mdjamal-app`. Deploy per playbook: `gcloud builds submit --tag us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:latest ... .` then `gcloud run deploy mdjamal-app --image=... --region=us-central1 --project=sml-interview-sandbox`. If new revision lands at 0% traffic, run `update-traffic --to-latest`.

## Auth0 credentials — ALREADY in Secret Manager (no trailing newline)
- `mdjamal-auth0-domain` = `dev-afe77gumoeorof8u.us.auth0.com`
- `mdjamal-auth0-client-id`
- `mdjamal-auth0-client-secret`
You must: grant the Cloud Run runtime service account `roles/secretmanager.secretAccessor` on these, and wire them into Cloud Run as env vars on deploy. The NextAuth Auth0 OIDC provider needs: issuer `https://dev-afe77gumoeorof8u.us.auth0.com`, the client id, the client secret. Callback URL is `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0` (already registered in the Auth0 app).

## Per DECISIONS.md (do exactly)
- **SDK:** NextAuth v5 + Auth0 OIDC provider. Do NOT install `@auth0/nextjs-auth0`.
- **Credentials fallback = YES:** keep the existing bcrypt credentials provider working ALONGSIDE Auth0. Do NOT remove `password_hash`/bcrypt. Both providers must resolve to the SAME `users.id` session identity. The existing `@demo.sml`/`demo1234` login MUST keep working (reviewer's email/password path).
- **Schema change via Prisma migration:** add `auth0_sub` (unique, nullable) + `onboarded_at` (nullable) to the `users` model; relax NOT NULL on `password_hash` and `username` as the plan specifies. Use `prisma migrate dev --name auth0_columns` against a throwaway local DB, commit schema + migration together; prod applies automatically via the `mdjamal-migrate` Cloud Run Job on deploy (0_init already baselined).
- **Identity mapping:** provision-on-first-login, RACE-SAFE via `upsert({ where: { auth0Sub } })`. Link-by-email adoption of an existing `users` row ONLY when the Auth0 token's `email_verified` is true (security).
- **Onboarding:** Auth0 users lack `username`/`school`/`class_year` (all required — validated vs `src/lib/schools.ts` / class-year list). Add a gated `/onboarding` route + server action capturing these. Carry an `onboarded` flag on the JWT; gate via the `authorized` callback in `auth.config.ts` WITHOUT importing Node-only deps. Follow the final's exact 3-edit chain (Node `jwt` → `session` → `authorized`), and overwrite `token.name` with the DB `username` in the Node `jwt` callback.
- **Reviewer login = BOTH:** email/password (retained credentials provider) AND Google (via Auth0).

## Edge-safety (do NOT break)
`src/lib/auth.config.ts` is the ONLY thing `src/middleware.ts` imports; it runs on the edge — NEVER import `pg`, `bcrypt`, `@prisma/client`, or `getPrisma` there. All DB work lives in Node-side `auth.ts` / server actions / route handlers. Verify the middleware bundle stays edge-clean.

## Likely CANNOT do from here — handle gracefully, document for the human
- Auth0 dashboard config needs Management API M2M creds (not provided). You cannot enable the Google connection / Database connection or create the Auth0 demo user. Implement code-side assuming they will be enabled, and document the exact manual steps. NOTE: credentials fallback means the email/password reviewer path already works WITHOUT an Auth0 DB user — so that demo user is optional.
- Interactive OAuth (Google) cannot be auto-tested headlessly. Verify what you can: `/api/auth/signin/auth0` 302-redirects to Auth0 `/authorize` with correct client_id/redirect_uri; credentials login still works end-to-end; protected routes redirect; not-yet-onboarded session routes to `/onboarding`. Mark Google end-to-end as "needs manual browser test."

## Hard guardrails
- Site MUST stay usable on the live URL after deploy. Even if Auth0 OIDC misconfigures, `@demo.sml`/`demo1234` login must still work. VERIFY post-deploy.
- NON-DESTRUCTIVE: auth_columns migration only ADDS nullable columns / relaxes NOT NULL — verify demo data intact.
- Gates pass before deploy: `npx tsc --noEmit`, `npm test`, DB-less `next build`. Middleware stays edge-clean.
- Never commit secrets. Repo is public.
- If blocked (IAM you lack, Auth0 dashboard config, reauth), STOP that sub-step, document, continue safely. Never leave the live site broken.

## Output / handoff
- Incremental local commits (Co-Authored-By line for Claude).
- Write progress to `/Users/yasifjamal/smlcrm/social-network/docs/v2-migration/auth0-impl-progress.md`: files changed, schema migration added, secrets/IAM wired, deploy status, verification results (passed vs needs-manual-browser-test), exact remaining manual Auth0-dashboard steps, anything deferred.

End your reply with: status (DONE/PARTIAL/BLOCKED), deploy + verification results, the manual Auth0-dashboard steps still needed, and whether the live site's existing login still works.
