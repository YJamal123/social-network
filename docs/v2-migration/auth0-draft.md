# Auth0 Migration — Process Draft (PLANNING ONLY)

> DRAFTER-AUTH output. This document is a migration **plan**, not an implementation.
> No application code was changed and no packages were installed while producing it.
> Cite file paths are relative to repo root `/Users/yasifjamal/smlcrm/social-network`.

---

## 1. Goal & Scope

### Goal
Replace the hand-rolled NextAuth-v5 *credentials* provider (server-side `bcrypt` + raw `password_hash` column) with **Auth0** managed authentication, with **Google login** enabled, while preserving every existing app feature that foreign-keys to `users.id`.

### "Done" means
- Users sign in through Auth0's Universal Login (Google social connection + optional Auth0 DB connection), not the local `/login` form.
- Every authenticated route still works against the **same `users.id`** identity (posts, follows, likes, comments, walls, pokes, taunts, relationships, messages).
- A brand-new Auth0 user is provisioned a `users` row and is forced through a one-time **onboarding step** that collects the still-required `username` + `school` (+ `class_year`) before they can use the app.
- `password_hash`, `bcryptjs`, and the credentials `authorize` path are removed (or explicitly retained behind a feature flag — see open questions).
- The live URL `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app` logs in via Auth0+Google end-to-end.
- The edge `src/middleware.ts` boundary stays free of Node-only deps.

### Out of scope
- Re-skinning Auth0's Universal Login beyond basic branding.
- Multi-factor auth, passwordless email, enterprise connections.
- Migrating the demo seed users' *passwords* into an Auth0 DB connection (we re-provision them instead — see §3.5).
- Any feature behavior change other than the auth/identity plumbing.

---

## 2. SDK Decision

Two viable approaches. Both keep JWT-style stateless sessions, which matches today's `session.strategy: "jwt"` (`src/lib/auth.config.ts:9`).

### Option A — `@auth0/nextjs-auth0` (Auth0's own App-Router SDK)
- Auth0 owns the `/api/auth/[login|logout|callback|me]` routes; session is an encrypted cookie it manages.
- Pros: least Auth0 glue code; first-class App Router support; battle-tested token handling/refresh.
- Cons: **largest churn for us.** Every call site currently uses NextAuth's `auth()` returning `session.user.{id,name}` (see inventory §7). With this SDK the server-side accessor becomes `getSession()`/`getAccessToken()` and the user shape is the OIDC profile (`sub`, `email`, `name`), *not* our `users.id`/`username`. We'd have to wrap it in our own `auth()`-shaped helper anyway to avoid rewriting ~90 call sites. Middleware-based route protection is done via the SDK's `withMiddlewareAuthRequired`, which is a different mechanism than the `authorized` callback in `auth.config.ts:12`.

### Option B — Keep NextAuth v5, add Auth0 as an OIDC provider (RECOMMENDED)
- Swap the `Credentials({...})` provider in `src/lib/auth.ts:11-26` for the built-in `Auth0` provider (`next-auth/providers/auth0`), configured with `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_ISSUER`.
- Google is enabled **inside the Auth0 tenant** (Auth0 Social Connection), so NextAuth only ever talks to Auth0 — we get Google "for free" without a second NextAuth provider or a Google OAuth app of our own.
- Pros — **least churn, cleanest fit with the existing architecture:**
  - `auth()`, `signIn`, `signOut`, `handlers` exports in `src/lib/auth.ts:8` stay identical in shape → **all ~90 `await auth()` call sites keep working unchanged** as long as the `jwt`/`session` callbacks keep populating `session.user.id` and `session.user.name` (see §3).
  - The edge `authorized` callback in `auth.config.ts:12-23` and `src/middleware.ts` keep working as-is (still import only `authConfig`).
  - JWT session model is preserved verbatim.
  - The `next-auth` dep is already installed (`package.json:16`).
- Cons: we still own the NextAuth config and the provider plumbing; Auth0's own SDK niceties (token refresh) aren't automatic, but irrelevant here since we only need identity, not Auth0 Management/API access tokens.

### Recommendation: **Option B (NextAuth v5 + Auth0 OIDC provider).**
Rationale: the entire codebase consumes identity through NextAuth's `auth()` → `session.user.{id,name}` contract (inventory in §7), and the edge-middleware split (`auth.config.ts` is the *only* middleware import — `middleware.ts:2`) is exactly the boundary Auth0's own SDK would force us to re-architect. Option B confines the change to: (1) the provider in `auth.ts`, (2) the `jwt`/`session` callbacks in `auth.config.ts`, (3) the login/register pages, (4) the schema (`auth0_sub`), and (5) a new onboarding flow. The 80+ feature call sites stay untouched. Google login is satisfied purely by tenant config, not code.

The rest of this document assumes **Option B**.

---

## 3. Identity-Mapping Design

### 3.1 The problem
- `users.id` is a server-generated `UUID DEFAULT gen_random_uuid()` (`src/app/api/migrate/route.ts:12`) and is the FK target for every feature table (posts `:22`, follows `:31-32`, likes `:39-40`, comments `:48-49`, wall_posts `:58-59`, plus pokes/taunts/relationships/messages further down the SCHEMA string).
- Auth0 issues a stable `sub` like `google-oauth2|10769150350006150715` or `auth0|abc123`. This is the durable join key — **email is mutable and not guaranteed unique across connections**, so we must not key purely on email.

### 3.2 Schema change (add to the `SCHEMA` string in `src/app/api/migrate/route.ts`)
Append to the idempotent ALTER block (currently `:121-129`):
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth0_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_sub_key ON users(auth0_sub) WHERE auth0_sub IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```
- `auth0_sub` = the join key; partial unique index allows pre-existing rows with NULL.
- `onboarded_at` = NULL until the user completes username/school capture; used to gate the onboarding redirect.
- Dropping `NOT NULL` on `password_hash` lets us provision Auth0-only rows without a fake hash (the column is retained for one release as a safety net, then dropped — see §6 Phase 8). This ALTER is idempotent-safe to re-run.

> Note: `password_hash` is also typed `password_hash: string` in `src/lib/types.ts:5`; once nullable it should become `password_hash: string | null` (deferred to §6 Phase 8 cleanup).

### 3.3 Provision-on-first-login flow
NextAuth's `signIn` callback (to be added to `auth.config.ts` — but see the edge caveat below) cannot touch `pg`. Therefore identity provisioning runs in the **Node-side `auth.ts`** via the `jwt` callback's first-login branch, OR — cleaner — via a `signIn` callback defined **only in `auth.ts`'s `NextAuth({...})` object** (which is Node, not edge). The split:
- `auth.config.ts` (edge): keep `authorized`, `session`, and a *thin* `jwt` that only copies fields already on the token. **No DB.**
- `auth.ts` (Node): override/extend with a `signIn` (or Node `jwt`) callback that does the DB upsert and enriches the token with `users.id`, `username`, `onboarded`.

Proposed Node-side login logic (pseudocode, lives in `auth.ts`):
```
on first sign-in with profile { sub, email, name }:
  row = SELECT id, username, onboarded_at FROM users WHERE auth0_sub = sub
  if !row:
    # link-by-email fallback for pre-existing/demo rows (one-time adoption)
    row = SELECT ... FROM users WHERE email = lower(email) AND auth0_sub IS NULL
    if row: UPDATE users SET auth0_sub = sub WHERE id = row.id   # adopt
    else:   INSERT users (id, email, auth0_sub) VALUES (gen_random_uuid(), email, sub) RETURNING id
            # username/school still NULL → onboarding required
  token.id        = row.id            # <-- keeps session.user.id stable
  token.name      = row.username      # may be null until onboarded
  token.onboarded = row.onboarded_at != null
```
The `session` callback then maps `token.id → session.user.id` and `token.name → session.user.name` (already done at `auth.config.ts:28-31`, extend to also copy `name` and an `onboarded` flag).

> **`username` uniqueness:** today `username` is `UNIQUE NOT NULL` (`migrate route :13`). New Auth0 rows are inserted with `username = NULL` until onboarding. That requires `username` to allow NULL. Two options: (a) drop `NOT NULL` on `username` and rely on the existing UNIQUE (Postgres treats NULLs as distinct, so multiple un-onboarded rows are fine); or (b) keep `NOT NULL` and insert a temporary placeholder. **Recommend (a):** `ALTER TABLE users ALTER COLUMN username DROP NOT NULL;` — cleaner, and onboarding enforces presence at the app layer. Add to §3.2.

### 3.4 Onboarding step (captures `username` + required `school` + `class_year`)
Auth0/Google give us `email` and `name` but **never `username` or `school`** — both are required by today's register action (`src/app/(auth)/register/actions.ts:21-33`, school validated against `SCHOOLS` in `src/lib/schools.ts:5-21`).

Design:
- New protected route `src/app/(main)/onboarding/page.tsx` + `actions.ts` (server action).
- Gate: in the edge `authorized` callback (`auth.config.ts`), if `auth.user.onboarded` is false and the path is not `/onboarding`, redirect to `/onboarding`. (The `onboarded` boolean rides on the JWT/session — no DB call in middleware. ✅ edge-safe.)
- The onboarding server action reuses the **existing validation**: `isValidSchool` (`schools.ts:19`) and `isValidClassYear` (`src/lib/classYears.ts`), plus username uniqueness (catch Postgres `23505`, mirroring `register/actions.ts:43-44`). On success:
  ```sql
  UPDATE users SET username=$1, school=$2, class_year=$3, onboarded_at=now()
  WHERE id=$4 AND onboarded_at IS NULL
  ```
  Then the session must be refreshed so `token.onboarded` flips true — easiest is to call `signOut`-less token update via NextAuth's `unstable_update`/`update` (v5) OR simply `redirect("/feed")` and let the next `auth()` re-read; cleanest is to trigger a session update. Flag for implementer (open question §8).
- Follows the mutation contract: return `{ error?: string }`, don't throw; `redirect()` after the try/catch (per CLAUDE.md and `register/actions.ts:50-51`).

### 3.5 Existing / demo users
- **Demo users** (`<username>@demo.sml` / `demo1234`, created by `src/app/api/seed/route.ts:686`): they have no Auth0 identity. The manager reviews with these. Two paths:
  1. **Re-provision as Auth0 DB users** (recommended for demo continuity): create matching users in an Auth0 *Database* connection with the same emails + a known demo password, so `<username>@demo.sml` / `demo1234` still works *through Auth0's login form*. The link-by-email fallback (§3.3) then adopts the existing seeded `users` rows (which already have username/school/class_year/avatar) and sets `auth0_sub` + `onboarded_at` so they skip onboarding. **Update `seed/route.ts` to stamp `onboarded_at = now()` and leave `password_hash` nullable.**
  2. Or drop demo email/password login entirely and have the reviewer use Google. Riskier for a timed review (reviewer may not want to use a personal Google account).
- **Real pre-existing users** (none expected beyond demo on this sandbox): same link-by-email adoption path handles them on first Auth0 login.

---

## 4. Edge-Middleware Boundary Plan

Today: `src/middleware.ts:1-8` imports **only** `authConfig` from `auth.config.ts`; the `authorized` callback (`auth.config.ts:12-23`) does the gating using `!!auth?.user`. This must stay Node-free.

Post-Auth0 (Option B), the boundary is preserved because Auth0-vs-credentials only changes the **provider** (lives in `auth.ts`, Node) and the **DB upsert** (lives in `auth.ts`, Node). The edge config changes are limited to *pure token reads*:
- `authorized` callback stays edge-safe; extend it to also redirect un-onboarded users to `/onboarding` based on `auth.user.onboarded` (a value already on the JWT — no DB).
- `jwt`/`session` callbacks in `auth.config.ts` stay pure (copy token fields only). The **DB-touching** enrichment moves to a Node-only callback in `auth.ts` (the `NextAuth({...})` object there merges over `authConfig`).
- **Hard rule (unchanged from CLAUDE.md):** `auth.config.ts` must never import `pg`, `bcrypt`, the Auth0 *Management* SDK, or `@/lib/db`. The Auth0 *provider import* (`next-auth/providers/auth0`) is edge-safe in principle, but to be safe keep `providers: []` in `auth.config.ts:10` and define the Auth0 provider only in `auth.ts` (as Credentials is today). Verify the middleware bundle doesn't balloon (per CLAUDE.md gotcha).

---

## 5. Config / Secret / URL Changes

### 5.1 Auth0 tenant + Application setup (manual, Auth0 dashboard)
1. Create a **Regular Web Application** in Auth0.
2. Enable the **Google social connection** for that application (Auth0 → Authentication → Social → Google). For a real tenant, supply Google OAuth client credentials in Auth0; Auth0's dev keys work for testing only.
3. (Optional, for demo) Enable a **Database connection** and create the demo users (§3.5).
4. Set Application URLs to the live Cloud Run URL:
   - **Allowed Callback URLs:** `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0`
     (NextAuth's Auth0 provider callback path is `/api/auth/callback/auth0`. Also add the `...110062063496.us-central1.run.app` alias from `cloud-run-public-access-blocked.md` if login may originate there.)
   - **Allowed Logout URLs:** `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/login` (and alias)
   - **Allowed Web Origins:** both run.app hosts.
   - For local dev: add `http://localhost:3000/api/auth/callback/auth0` etc.

### 5.2 Secret Manager + env vars
New secrets (NOT committed — repo is public, per CLAUDE.md "Never Do This"):
| Env var | Source | Notes |
|---|---|---|
| `AUTH0_CLIENT_ID` | new secret e.g. `mdjamal-auth0-client-id` | |
| `AUTH0_CLIENT_SECRET` | new secret e.g. `mdjamal-auth0-client-secret` | |
| `AUTH0_ISSUER` | new secret/env e.g. `mdjamal-auth0-issuer` | `https://<tenant>.us.auth0.com` (NextAuth Auth0 provider `issuer`) |
| `NEXTAUTH_SECRET` | existing `mdjamal-nextauth-secret` | **KEEP** — still signs the NextAuth JWT/session cookie. |
| `NEXTAUTH_URL` | existing | stays the real https run.app URL. |

> **Trailing-newline trap (`nextauth-secret-trailing-newline.md`):** `mdjamal-nextauth-secret` carries a `\n`. When creating the new Auth0 secrets, **do NOT** generate them with `openssl ... | gcloud secrets create` (which appends `\n`). Paste the exact Auth0 values with `printf '%s'` (no trailing newline), or the OIDC handshake will fail on a malformed client secret. Verify with `gcloud secrets versions access latest --secret=… | xxd | tail` and confirm it does NOT end in `0a`.

Wire all three new secrets into the Cloud Run service (`--update-secrets` / service YAML), same mechanism as the existing ones.

### 5.3 Build-time `allowedOrigins` (redeploy implication)
`next.config.mjs:9-13` `serverActions.allowedOrigins` is **build-time** (per `cloud-run-public-access-blocked.md` and CLAUDE.md). The onboarding flow and any new server actions will run under the same run.app origins already listed, so **no change to `allowedOrigins` is required** — but note that the migration *does* require a fresh **Cloud Build + redeploy** anyway (schema change, code change, new env/secrets). No env-only shortcut exists for the code changes.

---

## 6. Step-by-Step Sequenced Process

> Each phase is independently committable; `tsc --noEmit` + `npm test` must stay green (QA gate runs on push, `.git/hooks/pre-push`). The migrate/seed/deploy mechanics follow `deploy-and-ralph-playbook.md`.

**Phase 0 — Tenant prep (no code).** Create Auth0 app, enable Google connection, set callback/logout/web-origin URLs (§5.1). Create the three Auth0 secrets in Secret Manager *without* trailing newlines (§5.2). Wire them into Cloud Run.

**Phase 1 — Schema migration.** Add the `auth0_sub` / `onboarded_at` columns, the partial unique index, and the `DROP NOT NULL` on `password_hash` and `username` to the `SCHEMA` string in `src/app/api/migrate/route.ts` (§3.2 + §3.3 note). Deploy + run `/api/migrate` (token with trailing newline, URL-encoded — `nextauth-secret-trailing-newline.md`). Idempotent, safe.

**Phase 2 — Install SDK / provider.** Add `next-auth/providers/auth0` usage (no new package — `next-auth` already present, `package.json:16`). *(If Option A were chosen this is where `@auth0/nextjs-auth0` would be installed — but we're on Option B.)*

**Phase 3 — Provider swap + token enrichment.**
- In `src/lib/auth.ts`: replace the `Credentials({...})` provider (`:11-26`) with `Auth0({ clientId, clientSecret, issuer })`. Remove the `bcrypt`/`query`/`User` imports that only served credentials (`:1-6`).
- Add the Node-side `signIn`/`jwt` DB-upsert callback (§3.3) here (Node context — pg allowed).
- In `src/lib/auth.config.ts`: keep callbacks pure; extend `session` (`:28-31`) to also copy `token.name → session.user.name` and add `session.user.onboarded`; extend `jwt` (`:24-27`) to carry `name`/`onboarded` through.
- Update `src/types/next-auth.d.ts` to add `onboarded?: boolean` to `Session["user"]` and `JWT`.

**Phase 4 — Session wiring / route protection.** Extend the `authorized` callback (`auth.config.ts:12`) to redirect authenticated-but-not-onboarded users to `/onboarding` (§4). Keep the existing auth-page redirect logic.

**Phase 5 — Onboarding flow.** Add `src/app/(main)/onboarding/page.tsx` + `actions.ts` (§3.4), reusing `isValidSchool` / `isValidClassYear`, mutation-returns-`{error?}` contract, `redirect()` outside try/catch. Refresh session so `onboarded` flips.

**Phase 6 — Login / register pages.**
- `src/app/(auth)/login/page.tsx`: replace the credentials form + `signIn("credentials", …)` (`:3, :20-24`) with a single "Continue with Auth0 / Google" button calling `signIn("auth0", { redirectTo: "/feed" })` (or a server action). Universal Login + Google live on Auth0's side.
- `src/app/(auth)/register/`: the local register form/action (`page.tsx`, `actions.ts`) becomes redundant — either delete it and point "create account" to the same Auth0 sign-in (Auth0 handles sign-up), or keep it disabled. Recommend: collapse register into the Auth0 login button; username/school now captured by onboarding (§3.4), not registration.
- `src/components/SiteHeader.tsx:133,248`: `signOut({ redirectTo: "/login" })` keeps working; optionally add Auth0 federated logout (`returnTo` to fully clear the Auth0 session) — flag in §8.

**Phase 7 — Port identity call sites.** With Option B and the token enrichment preserving `session.user.id` **and** `session.user.name`, **no feature call site should need changes** (§7 inventory). Action item: grep-verify every `session.user.name` consumer still receives the username (e.g. `profile/[username]/edit/page.tsx:14`, `profile/actions.ts:115,423`, `SiteHeader.tsx:14`) because `name` now comes from our DB `username`, not Auth0's display name. This is the single highest-risk porting check.

**Phase 8 — Remove bcrypt / password_hash.**
- Remove `bcryptjs` + `@types/bcryptjs` from `package.json` (`:14, :23`).
- Remove `bcrypt` from `seed/route.ts:2,674` (re-seed demo users as Auth0-linked rows with `onboarded_at` set; password_hash NULL — §3.5).
- After one stable release, drop `password_hash` from the `SCHEMA` string and from `src/lib/types.ts:5`.

**Phase 9 — Deploy + verify.** Cloud Build → deploy → `/api/migrate` → `/api/seed` (per `deploy-and-ralph-playbook.md`), then run §9 checklist on the live URL.

---

## 7. Inventory of Identity Call Sites

All consume identity through `await auth()` → `session.user.id` / `session.user.name`. With Option B these stay valid **iff** the `jwt`/`session` callbacks keep populating both fields (Phase 3). Files:

**Reads `session.user.id`:**
- `src/app/(main)/messages/actions.ts:18,23,52,60,73,112,128,150,158,166`
- `src/app/(main)/messages/page.tsx:9`
- `src/app/(main)/messages/[username]/page.tsx:17`
- `src/app/(main)/pokes/actions.ts:14,19,45,53,67,72,101,109,123,135`
- `src/app/(main)/directory/page.tsx:45`
- `src/app/(main)/profile/[username]/edit/page.tsx:12,29,35`
- `src/app/(main)/profile/actions.ts:31,107,126,131,174,179,220,259,264,288,296,311,323,337,350,394,416`
- `src/app/(main)/friends/actions.ts:16,21,61,66,88,93,116,121,146,158,209,217`
- `src/app/(main)/taunts/actions.ts:15,20,56,64,78,83,122,130,144,156,164,172`
- `src/app/(main)/feed/actions.ts:12,24,41,46,82,95,111`
- `src/app/(main)/profile/[username]/page.tsx:134,141,145,154`
- `src/app/(main)/friends/page.tsx:10,12`
- `src/app/(main)/feed/page.tsx:35`

**Reads `session.user.name` (username) — HIGH-RISK, verify these in Phase 7:**
- `src/components/SiteHeader.tsx:13-21` (drives nav + all the badge counts)
- `src/app/(main)/profile/[username]/edit/page.tsx:14` (auth check: `session.user.name !== params.username`)
- `src/app/(main)/profile/actions.ts:32,115,395,423` (username used for revalidatePath + ownership)

**Auth plumbing to change:**
- `src/lib/auth.ts:1-28` (provider swap + Node DB-upsert callback)
- `src/lib/auth.config.ts:10-32` (extend session/jwt/authorized; keep edge-safe)
- `src/middleware.ts` (no change — still imports only `authConfig`)
- `src/app/api/auth/[...nextauth]/route.ts` (no change — still re-exports `handlers`)
- `src/types/next-auth.d.ts:3-20` (add `onboarded`)
- `src/app/(auth)/login/page.tsx:3,20` and `src/app/(auth)/register/{page.tsx,actions.ts}` (replace with Auth0 sign-in)
- `src/app/api/seed/route.ts:2,674,686` (drop bcrypt; provision Auth0-linked demo rows)

---

## 8. Risks, Rollback, Open Questions

### Risks
- **`session.user.name` semantics shift.** Today `name` = our `username`. With Auth0 the OIDC profile's `name` is a display name. The fix (token enrichment from DB `username`) is essential; if missed, profile ownership checks (`profile/[username]/edit/page.tsx:14`) and `revalidatePath` (`profile/actions.ts:423`) silently break. Highest-risk item.
- **Edge leakage.** Accidentally importing the Auth0 provider or any DB code into `auth.config.ts` breaks the edge middleware build (CLAUDE.md gotcha). Keep provider + upsert in `auth.ts` only.
- **Secret newline trap** corrupting `AUTH0_CLIENT_SECRET` → OIDC `invalid_client`. Mitigation in §5.2.
- **Callback URL mismatch** vs the run.app host the visitor landed on (two host formats exist) → Auth0 "callback URL mismatch". Add both.
- **Demo-login continuity for the manager's review.** If we drop credential login and the reviewer can't/won't use Google, the demo is unreviewable. §3.5 option 1 (Auth0 DB connection seeded with `<user>@demo.sml`/`demo1234`) mitigates.
- **Onboarding session refresh.** Flipping `onboarded` on the JWT mid-session needs a NextAuth session `update()` (v5) or a re-login; if not handled, the user loops back to `/onboarding`.

### Rollback
- Code: revert the provider swap commit; `auth.ts` returns to Credentials; login/register pages restored. The `auth0_sub`/`onboarded_at` columns are additive and harmless if left in place (rollback need not drop them). Keep `password_hash` (don't drop until Phase 8 is proven) so credential login still works on rollback.
- Infra: redeploy the prior image (Cloud Run keeps revisions); `--update-traffic` to the last good revision. Auth0 secrets can stay (unused).

### Open questions for the human
1. **Keep a credentials fallback during transition?** Recommend YES for one release (don't drop `password_hash`/bcrypt until Auth0 is verified live), so the manager's demo login keeps working while Auth0 is validated.
2. **How does the manager review?** Confirm whether reviewer uses Google or the seeded demo Auth0 DB users. This decides §3.5 path.
3. **Federated logout?** Should `signOut` also clear the Auth0 session (`returnTo` to Auth0's `/v2/logout`), or just our cookie? Affects whether "log out then log in" silently re-uses the Google session.
4. **Username collision UX in onboarding** — if a Google user's desired username is taken, we surface `{ error }` (mirrors `register/actions.ts:43`). Confirm that's acceptable vs auto-suggesting.
5. **Auth0 plan/tenant** — is there an existing Auth0 tenant for `sml-interview-sandbox`, or does one need creating? Google social connection needs real Google OAuth creds for production (Auth0 dev keys are test-only).

---

## 9. Verification Checklist (run on the live URL)

- [ ] `/login` shows the Auth0/Google entry point; no local password form remains (or remains only behind the transition flag).
- [ ] Clicking "Continue" → Auth0 Universal Login → Google → returns to `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/...` with a valid session (no callback-URL-mismatch).
- [ ] A **brand-new** Google user lands on `/onboarding`, cannot reach `/feed` until submitting a valid `username` + `school` (`SCHOOLS`) + `class_year`; on submit a `users` row exists with `auth0_sub` set and `onboarded_at` non-null.
- [ ] Duplicate username at onboarding returns the inline `{ error }` (Postgres 23505 path), no crash.
- [ ] After onboarding, `session.user.id` is the new `users.id` and `session.user.name` is the chosen username (verify `SiteHeader` shows correct nav + counts).
- [ ] **Existing data resolves:** a seeded demo user (adopted via link-by-email, §3.5) logs in, skips onboarding (`onboarded_at` pre-stamped), and sees their existing posts/follows/likes/walls — i.e. `users.id` is unchanged for them.
- [ ] Protected routes: hitting `/feed` while logged out redirects to `/login`; `/login` while logged in redirects to `/feed` (`auth.config.ts:18-22` behavior preserved).
- [ ] `signOut` from `SiteHeader` returns to `/login` and the session cookie is cleared.
- [ ] Edge check: `next build` succeeds and the middleware bundle did not pull in `pg`/`bcrypt`/Node APIs (CLAUDE.md gotcha).
- [ ] `npm test` + `npx tsc --noEmit` green (QA gate).
- [ ] No secrets committed; `AUTH0_*` only in Secret Manager; new secrets verified free of trailing `\n`.
