# Auth0 Migration — Independent Verification Report (VERIFY-AUTH)

**Verdict: PASS-WITH-NOTES.** The Auth0 OIDC migration is complete, correct, edge-safe, and
does NOT break the live site. The credentials fallback works end-to-end on the live URL, the
Auth0 authorize redirect is correctly wired (PKCE S256, right client_id/redirect_uri/scope),
the identity-mapping security guards are present and correct, all gates are green, and secrets/IAM
are wired with no trailing newlines. The notes are: one cosmetic schema deviation from the plan
(full vs partial unique index — verified benign on PG 15), and the items that genuinely need a
manual browser test + Auth0-dashboard toggles (out of headless scope).

Audited READ-ONLY on branch `feat/v2-prisma-auth0` (HEAD `5e685dc`, working tree clean — the
branch is NOT pushed, as the brief expects). Live service `mdjamal-app`, revision
**`mdjamal-app-00027-58z`** at **100%** traffic.

---

## Verdict per item

### 1. Credentials fallback works LIVE — PASS (most important)
Exercised end-to-end against `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app`:
- `GET /api/auth/csrf` → token obtained.
- `POST /api/auth/callback/credentials` with `thefacebook_tom@demo.sml` / `demo1234` →
  **HTTP 302**, `redirect_url = …/feed`.
- Session cookie `__Secure-authjs.session-token` set.
- `GET /api/auth/session` →
  `{"user":{"name":"thefacebook_tom","email":"thefacebook_tom@demo.sml","id":"2a3bbbb8-33f7-436e-9581-fe6851ca8eb2","onboarded":true},...}`.
  Note `name` is the DB **username** (not a display name) and `onboarded:true`.
- `GET /feed` (authed) → **HTTP 200**, title `sml — the network`, renders demo content.
- `GET /onboarding` (authed+onboarded) → **302 → /feed** (can't re-onboard).
- `GET /feed` (logged-out) → **307 → /login?callbackUrl=…** (protection intact).

The reviewer's login path is healthy. `src/lib/auth.ts:33-47` retains the bcrypt `authorize`
and correctly rejects Auth0-only rows (`if (!user || !user.passwordHash) return null`, line 35).

### 2. Auth0 OIDC wiring — PASS
`POST /api/auth/signin/auth0` 302-redirects to:
```
https://dev-afe77gumoeorof8u.us.auth0.com/authorize
  ?response_type=code
  &client_id=rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn
  &redirect_uri=https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0
  &code_challenge=<present>&code_challenge_method=S256
  &scope=openid profile email
```
All required params correct: host/path, client_id, exact callback redirect_uri, **PKCE S256**
(code_challenge present), scope includes openid/profile/email, response_type=code. The fact that
the real client_id appears in the redirect proves the secrets are read correctly at runtime (no
newline corruption). Google end-to-end consent requires a browser — redirect verified only (as
expected).

Provider config: `src/lib/auth.ts:20-24` — `Auth0({ clientId, clientSecret, issuer })` reading
`AUTH0_CLIENT_ID/SECRET/ISSUER`.

### 3. Edge-safety — PASS
- `src/lib/auth.config.ts` imports **only** `import type { NextAuthConfig }` (line 1). No
  `pg`/`bcrypt`/`@prisma/client`/`getPrisma`/`@/lib/db`. Grep for forbidden tokens: 0 matches.
- `src/middleware.ts` imports only `next-auth` + `@/lib/auth.config` (lines 1-2). Does NOT import
  `@/lib/auth` (the Node module). Confirmed.
- The Auth0 provider + the DB upsert live **only** in `src/lib/auth.ts` (Node). `auth.ts` spreads
  `...authConfig` and overrides only `callbacks.jwt` (line 56), so the edge instance never
  references the DB jwt.
- **Built bundle proof:** `.next/server/src/middleware.js` — 0 matches for
  `PrismaClient` / `bcrypt` / `getPrisma`. Middleware reported at 79 kB by `next build`.

### 4. Identity mapping correctness & SECURITY — PASS
`src/lib/auth.ts` Node `jwt` callback (lines 56-132):
- **Race-safe upsert by auth0Sub** — `prisma.user.upsert({ where: { auth0Sub: sub }, create: {…},
  update: {} })` (lines 68-73). Single statement on the unique key; a concurrent first request
  no-ops the update branch. Correct.
- **Link-by-email adoption gated on `email_verified === true`** (account-takeover guard) —
  `const verified = profile.email_verified === true` (line 63), and adoption only runs
  `if (verified && email && row.username === null && row.onboardedAt === null)` (lines 79-84),
  adopting only a legacy row with `auth0Sub: null` (lines 85-87), then deleting the placeholder
  (lines 96-98). **The HIGH-severity vector is correctly closed.**
- **`token.name` overwritten with DB username** (not Google display name) — `token.name =
  row.username` (line 104), with an explicit comment. The `session` callback
  (`auth.config.ts:51-60`) also copies it explicitly. This is the single highest-risk port per the
  plan and it is handled.
- **`token.onboarded` set and drives the gate** — `token.onboarded = row.onboardedAt !== null`
  (line 105); credentials path sets it from the authorize return (line 113); session callback
  copies it (`auth.config.ts:58`); `authorized` reads `auth?.user?.onboarded` (`auth.config.ts:14`).

### 5. Onboarding flow — PASS
- Route exists at `src/app/onboarding/` (`page.tsx`, `actions.ts`, `layout.tsx`) — placed OUTSIDE
  `(main)` so SiteHeader doesn't render for an un-navigable user.
- `actions.ts` validates `username` (non-empty), `school` via `isValidSchool`, `class_year` via
  `isValidClassYear` (lines 33-42); `updateMany … where { id, onboardedAt: null }` (double-submit
  guard, lines 47-55); P2002 → `{ error: "Username already taken" }` (lines 59-64); returns
  `{ ok: true }` (NOT a server redirect) — mutation contract honored (never throws).
- **No redirect loop:** `page.tsx:20-24` — on `state.ok`, calls `update()` (refreshes the JWT via
  the Node jwt `trigger === "update"` branch, `auth.ts:120-129`) **then** `router.push('/feed')`.
  The `authorized` gate routes not-onboarded → `/onboarding` and onboarded → `/feed`
  (`auth.config.ts:36-39`). Verified live: onboarded user hitting `/onboarding` 302s to `/feed`.
- A scoped `SessionProvider` in `onboarding/layout.tsx` keeps the global layout untouched
  (minimizes risk to the live login).

### 6. Schema / migration applied — PASS-WITH-NOTE
- `prisma/schema.prisma`: `username String? @unique` (line 36), `passwordHash String?` (line 38),
  `auth0Sub String? @unique @map("auth0_sub")` (line 54), `onboardedAt DateTime?` (line 55).
  Both username and passwordHash are nullable. Correct.
- Migration `prisma/migrations/20260618000000_auth0_columns/migration.sql` is additive: 2 ADD
  COLUMN, 2 DROP NOT NULL, 1 CREATE UNIQUE INDEX. Nothing destructive.
- Read sites handle null username safely: `src/lib/queries.ts:69` filters `username: { not: null }`
  in the directory; `src/app/(main)/messages/actions.ts:132` narrows `if (!found || found.username
  === null) return …`. Verified.
- **NOTE (cosmetic deviation, benign):** The plan (auth0-final §3.2) specified a *partial* unique
  index `… WHERE auth0_sub IS NOT NULL`. The applied migration creates a **full** unique index
  `CREATE UNIQUE INDEX "users_auth0_sub_key" ON "users"("auth0_sub")` (Prisma's `@unique` doesn't
  emit a partial predicate). This is **harmless on PostgreSQL 15**: a standard B-tree unique index
  treats NULLs as distinct (no `NULLS NOT DISTINCT` clause), so the 17 legacy demo rows with NULL
  `auth0_sub` coexist freely. The live site serves all demo data with these NULL rows, empirically
  confirming it. The upsert's `ON CONFLICT (auth0_sub)` target (Prisma `where: { auth0Sub }`) still
  works because we always insert a non-null sub. No action required; noting for accuracy vs the doc.

### 7. Secrets / IAM — PASS
- `mdjamal-auth0-client-id`, `-client-secret`, `-issuer` (and `-domain`) all exist with **NO
  trailing newline** — last bytes `0x6e`, `0x32`, `0x6d`, `0x6d` respectively (none is `0x0a`).
- Cloud Run service has `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER` wired as env
  (alongside the untouched `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`).
- Runtime SA `110062063496-compute@developer.gserviceaccount.com` has
  `roles/secretmanager.secretAccessor` on all three auth0 secrets (verified via get-iam-policy).
- Secret values were NOT printed.

### 8. Gates — PASS (all green)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm test` (Vitest) | **64/64 pass**, 7 files |
| DB-less `next build` (DATABASE_URL unset) | **passes**; `/onboarding` builds (1.35 kB) |
| Middleware bundle free of PrismaClient/bcrypt/getPrisma | **YES** (0 matches in `.next/server/src/middleware.js`) |

---

## Security findings

No open security findings. The two vectors the plan flagged are both correctly mitigated:
- **Account-takeover via unverified-email link** — CLOSED. Adoption gated on
  `email_verified === true` (`auth.ts:63,79-84`). (LOW residual: relies on the Auth0 tenant
  returning verified emails — Google does by default; the dashboard step below reinforces this.)
- **First-login provisioning race** — CLOSED via single-statement upsert on the unique key
  (`auth.ts:68-73`).

---

## Discrepancies vs the progress doc

- Progress doc (`auth0-impl-progress.md` §3.2 lineage) and `auth0-final.md` §3.2 specify a
  **partial** unique index on `auth0_sub`. The applied migration uses a **full** unique index.
  Benign on PG 15 (see item 6) — but the progress doc's "partial unique index" phrasing does not
  match the committed SQL. Cosmetic only.
- Everything else in the progress doc's "Gates" and "Live verification" tables was independently
  reproduced and matches (revision `00027-58z` @ 100%, credentials 302→/feed, Auth0 302 with S256,
  health ok).

## Manual Auth0-dashboard steps still outstanding (owed by the human)

For the Regular Web App with Client ID `rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn`:
1. **Enable the Google social connection** for this app, with genuine Google OAuth client creds
   (Auth0 dev keys are test-only/rate-limited). Ensure it returns **verified** email so
   link-by-email adoption can fire.
2. (Optional) Enable the Username-Password-Authentication DB connection — NOT required, the
   credentials fallback already serves `@demo.sml`/`demo1234`.
3. Confirm the **Allowed Callback URL**
   `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0` is registered (and, if the
   `…-110062063496.us-central1.run.app` alias host is used, add that callback too).

## What still needs a manual browser test (cannot be done headlessly)

- **Google sign-in end-to-end:** "Continue with Auth0" → Universal Login → Google consent →
  callback → first-login provisioning → `/onboarding` → submit username/school/class_year →
  `/feed`. The 302-to-Auth0 redirect, PKCE, and callback URL are verified here; the interactive
  consent + the onboarding JWT-refresh round-trip need a real browser.
- **Duplicate-username inline error** at onboarding (P2002 path) — code is correct; needs a live
  submit to observe the UI.
- **Verified-vs-unverified email adoption** behavior — code-correct; needs two real Google/DB
  accounts to exercise live.

---

*Read-only audit. No application code, migrations, deploys, or `/api/seed` POSTs were performed.*
