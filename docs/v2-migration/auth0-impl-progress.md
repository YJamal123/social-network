# Auth0 Migration — Implementation Progress & Handoff

**Status: DONE (code + infra deployed & verified live).** The one item that
cannot be done headlessly — interactive Google OAuth end-to-end — needs a manual
browser test, and two Auth0-dashboard toggles are owed by the human (below).

Built on top of the completed Prisma migration. Branch `feat/v2-prisma-auth0`,
**local commits only — NOT pushed** (per brief).

NextAuth v5 + Auth0 OIDC provider (Option B), with the bcrypt **credentials
fallback retained**. Both providers resolve to the same `users.id`.

---

## What changed (by area)

### Schema migration — `20260618000000_auth0_columns` (commit on this branch)
- `prisma/schema.prisma` already carried the Auth0 columns (WIP `5925683`):
  `auth0Sub String? @unique @map("auth0_sub")`, `onboardedAt DateTime?
  @map("onboarded_at") @db.Timestamptz(6)`, and `username`/`passwordHash`
  relaxed to nullable.
- **Generated the migration OFFLINE (no shadow DB, no local Postgres/Docker)**
  via `prisma migrate diff --from-schema-datamodel <git 347fcb3 schema>
  --to-schema-datamodel prisma/schema.prisma --script`. Output was exactly the
  5 expected statements (2 ADD COLUMN, DROP NOT NULL ×2, CREATE UNIQUE INDEX) —
  nothing destructive. Written to
  `prisma/migrations/20260618000000_auth0_columns/migration.sql`.
- **Applied in prod** via the existing `mdjamal-migrate` Cloud Run Job
  (`gcloud run jobs update --image=<new migrate> ` then `... execute --wait`).
  Job log: `Applying migration 20260618000000_auth0_columns` → `All migrations
  have been successfully applied.` Only the new migration ran (`0_init`
  baselined). Additive/non-destructive — demo data intact (re-seed counts match).

### Auth code (commit "Auth0 OIDC provider + onboarding")
- **`src/lib/auth.ts`** — added `Auth0({ clientId, clientSecret, issuer })`
  alongside the retained `Credentials` provider. New **Node `jwt` callback**:
  - Auth0 first sign-in: race-safe `prisma.user.upsert({ where: { auth0Sub } })`.
  - `email_verified`-gated **link-by-email**: only a verified email adopts an
    existing legacy row (`auth0Sub: null`, same email); deletes the placeholder.
    Blocks the account-takeover vector.
  - Overwrites `token.name` with the DB `username` (not the OIDC display name) —
    the single highest-risk port; keeps every ownership/revalidate check correct.
  - Sets `token.onboarded` from `onboardedAt`.
  - Credentials path: sets id/name/onboarded from the authorize() return (which
    now also returns `onboarded`); rejects Auth0-only rows (no passwordHash).
  - `trigger === "update"` branch re-reads onboarding state so the onboarding
    flow refreshes the JWT without a relogin (no redirect loop).
- **`src/lib/auth.config.ts`** (edge-safe, still no Node imports) — `authorized`
  now routes logged-in-but-not-onboarded users to `/onboarding` and keeps them
  out once onboarded; `session` copies `name` + `onboarded` from the token.
- **`src/types/next-auth.d.ts`** — `onboarded?: boolean` on `Session.user`,
  `User`, and `JWT`.
- **`src/app/onboarding/`** (NEW, placed OUTSIDE `(main)` so SiteHeader doesn't
  render for a user who can't navigate yet):
  - `actions.ts` — `onboard()` validates username/school (`isValidSchool`) /
    class_year (`isValidClassYear`); `updateMany ... WHERE onboardedAt IS NULL`;
    P2002 → `{ error: "Username already taken" }`; returns `{ ok: true }` on
    success (NOT a server redirect) so the client can refresh the JWT first.
    Mutation contract honored (returns `{error?}`, never throws).
  - `page.tsx` — client form; on `ok` calls `useSession().update()` then
    `router.push('/feed')` (flips `token.onboarded` → no loop).
  - `layout.tsx` — a **scoped** `SessionProvider` (only `/onboarding` needs
    `useSession`; the rest of the app reads `await auth()` server-side, so the
    global layout is untouched — minimizing risk to the live login).
- **`src/app/(auth)/login/page.tsx`** — added a "Continue with Auth0" button
  (`signIn('auth0', { callbackUrl: '/feed' })`) beside the retained credentials
  form (reviewer login = BOTH).
- **`src/app/api/seed/route.ts`** — demo users now seeded with
  `onboardedAt: new Date()` (so credentials login lands on `/feed`, and a future
  Auth0 verified link-by-email skips onboarding). Passwords kept (fallback).
- **`src/lib/queries.ts` / `src/app/(main)/messages/actions.ts`** — handled the
  now-nullable `username` Prisma type at the two read sites that assumed
  non-null (`fetchRecentUsers` filters `username NOT NULL`; `getThread` narrows
  the looked-up-by-username partner). Type-only fixes.

### Secrets / IAM wired
- Created **`mdjamal-auth0-issuer`** = `https://dev-afe77gumoeorof8u.us.auth0.com`
  (the NextAuth Auth0 `issuer`; derived from `mdjamal-auth0-domain`). Verified
  **no trailing newline** (last byte `m`, not `0a`). The existing
  `mdjamal-auth0-{domain,client-id,client-secret}` were also confirmed
  newline-free.
- Granted the Cloud Run **runtime SA**
  `110062063496-compute@developer.gserviceaccount.com`
  `roles/secretmanager.secretAccessor` on `mdjamal-auth0-client-id`,
  `mdjamal-auth0-client-secret`, `mdjamal-auth0-issuer`.
- Deployed with `--update-secrets AUTH0_CLIENT_ID=mdjamal-auth0-client-id:latest,
  AUTH0_CLIENT_SECRET=mdjamal-auth0-client-secret:latest,
  AUTH0_ISSUER=mdjamal-auth0-issuer:latest` (existing DATABASE_URL /
  NEXTAUTH_SECRET / NEXTAUTH_URL untouched).

### Build / deploy
- **Cloud Build only** (no local Docker — laptop disk constraint): build
  `eab59a62-...` SUCCESS, both images (`mdjamal-app:auth0-20260618150247` +
  `mdjamal-migrate:auth0-20260618150247`).
- Deployed revision **`mdjamal-app-00027-58z`**, serving **100% traffic**.
- Migrate Job executed (`mdjamal-migrate-5g7l4`) — applied the new migration.
- Re-seeded so existing demo rows get `onboarded_at` stamped.

---

## Gates (all green, pre-deploy)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` (Vitest) | 64/64 pass |
| DB-less `next build` (`DATABASE_URL` unset) | passes; `/onboarding` builds |
| Middleware bundle free of `PrismaClient`/`bcrypt`/`pg`/`getPrisma` | YES (0 matches in `.next/server/src/middleware.js`) |

## Live verification (on `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app`)

| Check | Result |
|---|---|
| `GET /api/health` | `{"ok":true}` |
| **Credentials login** (`thefacebook_tom@demo.sml`/`demo1234`) | 302 → `/feed`; session `id` resolved, `name`=`thefacebook_tom`, `onboarded:true` |
| `/feed` authed+onboarded | 200, renders demo posts (harvard/cornell) |
| `/onboarding` authed+onboarded | 302 → `/feed` (can't re-onboard) |
| `/feed` logged-OUT | 307 → `/login?callbackUrl=...` |
| **Auth0 sign-in 302** | redirects to `https://dev-afe77gumoeorof8u.us.auth0.com/authorize` with correct `client_id`, `redirect_uri=…/api/auth/callback/auth0`, `code_challenge_method=S256` (PKCE), `scope=openid profile email` → secrets wired correctly, no newline corruption |
| `/login` page | shows BOTH "Log in" (credentials) + "Continue with Auth0" |
| `POST /api/seed` | `{ok:true, counts:{users:17,posts:81,...}}` — demo data intact |

**The live site's existing login still works** (credentials path verified
end-to-end).

---

## Needs manual browser test (cannot be done headlessly)

- **Google sign-in end-to-end:** "Continue with Auth0" → Universal Login →
  Google → callback → first-login provisioning → `/onboarding` → submit
  username/school/class_year → `/feed`. The 302-to-Auth0 redirect, PKCE, and
  callback URL are verified; the interactive consent + the onboarding round-trip
  need a real browser. Expected behavior: a brand-new Google user lands on
  `/onboarding`, cannot reach `/feed` until submitting a valid
  username + school (SCHOOLS) + class_year (CLASS_YEARS); duplicate username
  returns an inline error; on success the JWT refreshes and `/feed` loads.

---

## Manual Auth0-dashboard steps the human still owes

The agent has no Auth0 Management API M2M creds, so these tenant toggles must be
done in the Auth0 dashboard for the **Regular Web Application** whose Client ID
is `rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn`:

1. **Enable the Google social connection** (Authentication → Social → Google) for
   this application. For real production login, supply genuine Google OAuth
   client credentials (Auth0 dev keys are test-only / rate-limited). Ensure the
   connection returns **verified** email (Google does by default) — required for
   the link-by-email adoption to fire.
2. **(Optional) Enable the Username-Password-Authentication Database connection**
   and optionally seed a demo user there. **Not required** — the credentials
   fallback is retained, so `@demo.sml`/`demo1234` already works via the existing
   bcrypt login without any Auth0 DB user.
3. Confirm the **Allowed Callback URL**
   `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0` is
   registered (per STATE.md it already is). For completeness also add the
   `…-110062063496.us-central1.run.app` alias callback + the corresponding
   Allowed Logout URLs / Web Origins if both hosts are used.

---

## Deferred / notes for next agent

- **`git push` not done** (not authorized). Branch has local commits ahead;
  pushing triggers CD (`deploy.yml`), which builds both images + runs the
  migrate Job automatically — the new migration is idempotent there.
- **Federated logout deferred** — `signOut({ redirectTo: '/login' })` clears our
  cookie (enough for review). To also clear the Auth0/Google SSO session, redirect
  to Auth0 `/v2/logout?client_id=…&returnTo=…` (needs an Allowed Logout URL).
- **Phase 8 (remove credentials/bcrypt) NOT done** — intentionally retained this
  release per DECISIONS (transition fallback). When dropping it later: delete the
  credentials provider + register page/action, remove `bcryptjs`, stop writing
  `password_hash` in seed, and re-tighten types if desired.
- **AUTH0_ISSUER secret note:** the brief listed only domain/client-id/secret.
  The NextAuth Auth0 provider needs the full issuer URL, so I created
  `mdjamal-auth0-issuer` (= `https://` + domain). If you'd rather derive it in
  code from the domain secret, that's a future cleanup — current wiring works.
