# Auth0 Migration — HARDENED FINAL (PLANNING ONLY)

> CRITIC-AUTH output. Adversarial review of the DRAFTER-AUTH draft, re-verified against the
> live codebase and current Auth0 / NextAuth v5 / Next.js 14 reality. **This is a plan, not an
> implementation.** No application code was changed and no packages were installed.
> File paths are relative to repo root `/Users/yasifjamal/smlcrm/social-network`.
> Self-contained — you do not need the draft to execute this.

---

## 0. Changes from draft / what the critique caught

Concrete corrections, each with evidence:

1. **Call-site count was wrong/conflated.** Draft says "~90 `auth()` call sites." Reality:
   **43 `await auth()` invocations** across **14 files**, and **89 reads of `session.user.id`**.
   The "~90" is the `session.user.id` *read* count, not call sites. Verified by grep
   (`grep -rno 'await auth()'` → 43; `grep -rno 'session\.user\.id'` → 89). The conclusion the
   draft drew from it (Option B leaves them untouched) still holds — but the number is restated
   correctly below.

2. **`session.user.name` inventory in draft §7 is inaccurate.** Draft claims `SiteHeader.tsx:13-21`
   "drives nav + all the badge counts" via `name`, and lists `profile/actions.ts:32,115,395,423`.
   Verified reality — `user.name` is read in exactly **6 places across 2 files**:
   - `src/app/(main)/profile/actions.ts:32, 115, 395, 423`
   - `src/app/(main)/profile/[username]/edit/page.tsx:14`
   Plus `src/components/SiteHeader.tsx:14` reads `session?.user?.name` but only as a **truthiness
   gate** (`const username = session?.user?.name; const pokeCount = username ? … : 0`) — it does
   **not** render the name into the nav. So the highest-risk consumer is not SiteHeader; it is
   `profile/actions.ts:423` / `:115` (which build `revalidatePath('/profile/${username}')` and the
   post-update `redirect`) and the ownership check at `profile/[username]/edit/page.tsx:14`
   (`session.user.name !== params.username`). The draft's overall point — "`name` must equal our
   `username`" — is **upheld and is the single highest-risk port**, but the cited surface was wrong.

3. **The draft misdescribes how `session.user.name` is populated today.** Draft Phase 3 says
   "extend the `session` callback to copy `token.name → session.user.name`." But the current
   `session` callback (`auth.config.ts:28-31`) copies **only `token.id`** and never touches `name`,
   yet `session.user.name` works in production. The reason: NextAuth's **default** behavior persists
   `name` from the `authorize()` return (`auth.ts:24` returns `{ id, name: user.username, email }`)
   onto the JWT, and the **default session population** copies `token.name → session.user.name`
   *before* our custom `session` callback runs. **Implication:** under Auth0 OIDC, `token.name`
   will default to the OIDC `name` claim (Google display name), NOT our `username`. We must
   **explicitly overwrite** `token.name` with the DB `username` in a Node-side `jwt` callback,
   otherwise ownership checks and revalidation paths silently break. This is sharper than the draft.

4. **`@auth0/nextjs-auth0` (Option A) description is stale.** Draft says it "owns the
   `/api/auth/[login|logout|callback|me]` routes." In the current v4 of that SDK the routes are
   mounted by its middleware at `/auth/login`, `/auth/logout`, `/auth/callback`, `/auth/profile`
   (no `/api` prefix), and `getSession`/`getAccessToken` come from `@auth0/nextjs-auth0/server`.
   Doesn't change the recommendation (still Option B) but the rationale is corrected.

5. **Provision-on-first-login pseudocode is NOT race-safe.** Draft does
   `SELECT … ; if !row INSERT`. Two concurrent first requests (e.g. parallel RSC + server action,
   or a double-clicked login) race between the SELECT and INSERT and either create **duplicate
   rows** or throw a unique-violation that aborts login. Fixed below with a single
   `INSERT … ON CONFLICT (auth0_sub) DO UPDATE … RETURNING` upsert.

6. **Link-by-email is an account-takeover vector as written.** Draft mentions link-by-email but
   does not require `email_verified`. An attacker can register an Auth0 DB account with a victim's
   email left unverified and, on first login, **adopt the victim's existing `users` row** (their
   posts, messages, relationships). Fixed below: link-by-email is gated on
   `profile.email_verified === true` (and we recommend enforcing verified email at the tenant level).

7. **`onboarded` flag mechanics under-specified.** Draft says it "rides on the JWT — no DB in
   middleware." Correct in spirit, but the chain is: Node `jwt` callback sets `token.onboarded` →
   `session` callback copies it to `session.user.onboarded` → the `authorized` callback reads
   `auth.user.onboarded`. All three edits are required; the draft only named two. Detailed below.

8. **Minor cite fixes.** `auth.config.ts` session callback is lines **28-31** (correct).
   `seed/route.ts` imports `getPool` (default export) — `import getPool from "@/lib/db"` (line 3),
   not the `query` named helper; demo INSERT is at **`:686`**, `bcrypt.hash` at **`:674`**,
   `import bcrypt` at **`:2`** (all draft cites correct). `next-auth.d.ts` lives at
   `src/types/next-auth.d.ts` and currently declares `Session.user = { id, name?, email? }` and
   `JWT = { id? }` — both must gain `onboarded?: boolean` (the draft said "add `onboarded`" but
   note `name` is *already* declared on `Session.user`, so no new `name` field is needed there).

9. **`class_year` is definitively required, not "possibly."** `register/actions.ts:21` rejects a
   missing `class_year`; `page.tsx` marks the `<select name="class_year" required>`. Onboarding
   MUST collect `username` + `school` + `class_year`.

10. **SDK recommendation: UPHELD (Option B), with a strengthened rationale** — see §2.

---

## 1. Goal & Scope

### Goal
Replace the hand-rolled NextAuth-v5 **credentials** provider (server-side `bcryptjs` +
`users.password_hash`) with **Auth0 Universal Login**, with **Google** enabled as an Auth0 social
connection, while preserving every feature that foreign-keys to `users.id`.

### "Done" means
- Users sign in via Auth0 Universal Login (Google social connection + an Auth0 Database connection
  for the demo reviewer), not the local `/login` password form.
- Every authenticated route still resolves the **same `users.id`** (posts, follows, likes,
  comments, walls, pokes, taunts, relationships, friendships, messages — all FK `users(id)`).
- `session.user.name` continues to equal our DB `username` (not the Google display name).
- A brand-new Auth0 user gets a `users` row and is forced through a one-time **`/onboarding`** step
  collecting `username` + `school` (validated vs `SCHOOLS`, `src/lib/schools.ts:5-21`) +
  `class_year` (validated vs `CLASS_YEARS`, `src/lib/classYears.ts:6-19`) before reaching the app.
- The edge `src/middleware.ts` boundary stays free of Node-only deps (`pg`, `bcrypt`, Auth0 Mgmt SDK).
- The live URL `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app` logs in end-to-end via Auth0+Google,
  and the reviewer can log in via a seeded Auth0 DB account.

### Out of scope
- Re-skinning Universal Login beyond basic branding; MFA; passwordless; enterprise connections.
- Migrating demo *password hashes* into Auth0 (we re-provision demo identities — §3.5).
- Any behavior change beyond auth/identity plumbing.

---

## 2. SDK Decision — UPHELD: Option B (NextAuth v5 + Auth0 OIDC provider)

Two approaches; both keep stateless JWT sessions, matching today's
`session: { strategy: "jwt" }` (`src/lib/auth.config.ts:9`).

### Option A — `@auth0/nextjs-auth0` (Auth0's own SDK)
- v4 mounts auth routes via its middleware at `/auth/login`, `/auth/logout`, `/auth/callback`,
  `/auth/profile`; server reads are `getSession()` / `getAccessToken()` from
  `@auth0/nextjs-auth0/server`; the session shape is the **OIDC profile** (`sub`, `email`, `name`),
  not our `users.id` / `username`.
- **Cost for us:** every one of the **43 `await auth()`** call sites + **89 `session.user.id`**
  reads expects NextAuth's `auth()` → `session.user.{id,name}` contract. Adopting Option A means
  either rewriting all of them or hand-rolling an `auth()`-shaped adapter over `getSession()` plus a
  DB lookup on every request — i.e. re-implementing exactly what Option B gives for free. Route
  protection also moves from our `authorized` callback (`auth.config.ts:12-23`) to the SDK's own
  middleware mechanism, forcing a re-architecture of the edge boundary that CLAUDE.md warns about.

### Option B — Keep NextAuth v5, add Auth0 as an OIDC provider  ✅ RECOMMENDED
- Replace `Credentials({…})` in `src/lib/auth.ts:11-26` with the built-in
  `Auth0` provider (`import Auth0 from "next-auth/providers/auth0"`), configured with
  `clientId` / `clientSecret` / `issuer`.
- Google is enabled **inside the Auth0 tenant** (Auth0 → Authentication → Social → Google).
  NextAuth only ever speaks OIDC to Auth0 — no second NextAuth provider, no Google OAuth app of ours.
- The public surface (`handlers`, `signIn`, `signOut`, `auth` from `src/lib/auth.ts:8`) is unchanged
  in shape, so the 43 `auth()` invocations and 89 `session.user.id` reads keep working **as long as
  the `jwt`/`session` callbacks keep populating `session.user.id` and `session.user.name` from our
  DB** (§3).
- The edge `authorized` callback and `src/middleware.ts` keep importing only `authConfig` — no churn.
- `next-auth` is already a dependency (`package.json`, `"next-auth": "^5.0.0-beta.31"`); **no new
  package** is required for the core swap.

**Why B wins (strengthened):** the codebase's entire identity contract is NextAuth's
`auth()` → `session.user.{id,name}`. Option B is purely additive at the provider + callback layer and
preserves the edge-middleware split (`auth.config.ts` is the *only* thing `middleware.ts:2` imports).
Option A would force re-plumbing both the call-site contract and the edge boundary — strictly more
work for an interview-grade app whose only need from Auth0 is *identity* (no Management API, no
upstream access-token refresh).

**One caveat that does not change the verdict:** with the built-in `Auth0` provider we manually own
the `issuer`/PKCE config and federated-logout behavior (§6 Phase 6, §8 Q3). These are a few lines,
far cheaper than Option A's rewrite.

The rest of this document assumes **Option B**.

---

## 3. Identity-Mapping Design

### 3.1 The join key
- `users.id` is `UUID DEFAULT gen_random_uuid()` (`src/app/api/migrate/route.ts:12`) and is the FK
  target for posts (`:22`), follows (`:31-32`), likes (`:39-40`), comments (`:48-49`),
  wall_posts (`:58-59`), pokes (`:67-68`), taunts (`:77-78`), relationships (`:87-88`),
  friendships (`:98-99`), messages (`:110-111`).
- Auth0 issues a stable `sub` (e.g. `google-oauth2|10769…` or `auth0|abc123`). **`sub` is the durable
  join key.** Email is mutable and not unique across connections — never key purely on email.

### 3.2 Schema change (append to the `SCHEMA` string, after `src/app/api/migrate/route.ts:129`)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth0_sub    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth0_sub_key
  ON users(auth0_sub) WHERE auth0_sub IS NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN username      DROP NOT NULL;
```
- `auth0_sub` — the join key. Partial unique index allows the many pre-existing NULLs while
  guaranteeing one row per Auth0 identity. **This index is required for the race-safe upsert in §3.3
  to have a conflict target.**
- `onboarded_at` — NULL until username/school/class_year captured; gates the onboarding redirect.
- `DROP NOT NULL` on `password_hash` — lets us provision Auth0-only rows without a fake hash.
- `DROP NOT NULL` on `username` — a freshly-provisioned Auth0 row has no username until onboarding.
  The existing `UNIQUE` constraint on `username` stays; Postgres treats multiple `NULL`s as distinct,
  so many un-onboarded rows coexist. App-layer onboarding enforces presence + uniqueness.

All five statements are idempotent (`IF NOT EXISTS` / `IF EXISTS` semantics; `DROP NOT NULL` on an
already-nullable column is a no-op). Apply via `/api/migrate` (token mechanics in §5.2).

> Type follow-up (defer to Phase 8): `src/lib/types.ts:5` declares `password_hash: string` and
> `:4` (effectively) `username: string`. Once the columns are nullable, these should become
> `string | null`. **Do not** change them in the same commit as the schema — the credentials path is
> still live during the transition and expects non-null. Change them only after credentials removal.

### 3.3 Provision-on-first-login (race-safe, email-verification-gated)
Runs in **Node** (`src/lib/auth.ts`), never on the edge. Recommended placement: the **`jwt` callback
defined in the `NextAuth({…})` object in `auth.ts`** (Node runtime → `pg` allowed), which runs on
first sign-in when `account`/`profile` are present. (A `signIn` callback also works but cannot mutate
the token; the `jwt` callback both upserts *and* enriches the token in one place.)

```ts
// PSEUDOCODE — lives in src/lib/auth.ts (Node). Uses the existing query() helper.
async jwt({ token, account, profile }) {
  if (account && profile) {                       // first call after a fresh sign-in
    const sub   = profile.sub as string
    const email = (profile.email as string | undefined)?.toLowerCase() ?? null
    const verified = profile.email_verified === true

    // 1) Race-safe insert-or-fetch keyed on auth0_sub.
    const { rows } = await query(
      `INSERT INTO users (id, email, auth0_sub)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (auth0_sub) DO UPDATE SET auth0_sub = EXCLUDED.auth0_sub
       RETURNING id, username, onboarded_at`,
      [email, sub]
    )
    let row = rows[0]

    // 2) Link-by-email adoption — ONLY for verified emails, ONLY if this is a
    //    brand-new row (no username yet) and a legacy row exists with no auth0_sub.
    if (verified && email && row.username === null && row.onboarded_at === null) {
      const adopt = await query(
        `UPDATE users SET auth0_sub = $1
         WHERE email = $2 AND auth0_sub IS NULL
         RETURNING id, username, onboarded_at`,
        [sub, email]
      )
      if (adopt.rows[0]) {
        // delete the just-created placeholder row, keep the legacy one
        await query(`DELETE FROM users WHERE id = $1 AND username IS NULL`, [row.id])
        row = adopt.rows[0]
      }
    }

    token.id        = row.id                    // keeps session.user.id stable
    token.name      = row.username              // OVERWRITE OIDC name with our username (may be null)
    token.onboarded = row.onboarded_at !== null
  }
  return token
}
```
Notes:
- The `ON CONFLICT (auth0_sub)` requires the partial unique index from §3.2. Because the index is
  `WHERE auth0_sub IS NOT NULL`, the conflict target must be expressed as the same partial predicate;
  Postgres matches a partial unique index automatically when the inserted row satisfies the predicate
  (it always does here — we always insert a non-null `sub`). If your PG version rejects the implicit
  match, fall back to `INSERT … ON CONFLICT ON CONSTRAINT users_auth0_sub_key …` is **not** valid for
  an index, so instead use a `SELECT … FOR UPDATE` inside an explicit transaction, or a
  `pg_advisory_xact_lock(hashtext(sub))` guard. The `INSERT … ON CONFLICT (auth0_sub) WHERE auth0_sub IS NOT NULL`
  form is the clean path and works on PostgreSQL 15 (our version).
- **The `token.name = row.username` line is load-bearing** (see §0 item 3). Without it `session.user.name`
  becomes the Google display name and every ownership/revalidate check that compares against the
  username breaks.
- `email` adoption is gated on `profile.email_verified === true`. Additionally set the tenant so Google
  always returns verified emails and the Auth0 DB connection requires email verification (§5.1), so the
  unverified path effectively never adopts.

### 3.4 Edge `session` + `authorized` wiring (in `auth.config.ts`, pure)
Extend the existing pure callbacks (no DB):
```ts
// auth.config.ts — additions only; still no pg / bcrypt.
async jwt({ token }) { return token },               // Node auth.ts jwt does the enrichment;
                                                     //   keep this thin copy so edge build is happy
session({ session, token }) {
  if (token.id) session.user.id = token.id as string
  // token.name is already copied to session.user.name by NextAuth defaults,
  // but copy explicitly to be safe under the OIDC provider:
  if (typeof token.name === "string" || token.name === null) session.user.name = token.name
  session.user.onboarded = token.onboarded === true   // NEW
  return session
},
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn  = !!auth?.user
  const onboarded   = auth?.user?.onboarded === true
  const path        = nextUrl.pathname
  const isAuthPage  = path.startsWith("/login") || path.startsWith("/register")
  const isOnboarding = path.startsWith("/onboarding")

  if (isAuthPage) {
    if (isLoggedIn) return Response.redirect(new URL(onboarded ? "/feed" : "/onboarding", nextUrl))
    return true
  }
  if (!isLoggedIn) return false                        // → redirect to /login (pages.signIn)
  if (!onboarded && !isOnboarding)
    return Response.redirect(new URL("/onboarding", nextUrl))
  if (onboarded && isOnboarding)
    return Response.redirect(new URL("/feed", nextUrl))
  return true
}
```
**Why this is edge-safe:** `auth.config.ts` still imports nothing Node-only; `auth.user.onboarded`
arrives via `token.onboarded`, set by the Node `jwt` callback in `auth.ts` (which *overrides/merges*
over `authConfig.callbacks` because `auth.ts` does `NextAuth({ ...authConfig, providers:[…],
callbacks:{ ...authConfig.callbacks, jwt: nodeJwt } })`). The middleware only ever runs the edge
callbacks; the Node `jwt` runs only inside the `/api/auth/*` route handlers and server `auth()` calls.

> **Subtlety to verify in build:** `NextAuth(authConfig)` is constructed **twice** — once in
> `middleware.ts:4` (edge, no Node `jwt`) and once in `auth.ts:8` (Node, with the DB `jwt`).
> Confirm `auth.ts` spreads `authConfig.callbacks` and overrides only `jwt` (and extends `session`),
> so the edge instance never references the DB `jwt`. This is the existing pattern — keep it.

### 3.5 Existing / demo users + the reviewer path
- **Demo users** (`<username>@demo.sml`, shared password `demo1234`, created by
  `src/app/api/seed/route.ts:686`; `bcrypt.hash` at `:674`). The reviewer logs in with these.
  **Recommended (Option 1 — keeps the demo reviewable):**
  1. In Auth0, create a **Database connection** ("Username-Password-Authentication" or a custom DB
     connection) and pre-create the demo users with the same `@demo.sml` emails + `demo1234` password
     (Auth0 Management API or dashboard; or a one-off script — *not* committed). Mark them
     **email-verified** so the link-by-email adoption (§3.3) fires.
  2. Update `seed/route.ts` so seeded rows are pre-onboarded and credential-free:
     stamp `onboarded_at = now()` in the INSERT (`:686`) and stop writing `password_hash`
     (pass `NULL`, or omit the column). On the reviewer's first Auth0 login, the verified
     link-by-email path adopts the existing seeded `users` row (which already has
     username/school/class_year/avatar/posts) and sets `auth0_sub` — so they **skip onboarding** and
     see all existing data with the **same `users.id`**.
  - Without an Auth0 **Database** connection there is *no* email/password form on Universal Login — only
    the Google button. So **yes, a Database connection is required** for the `@demo.sml`/`demo1234`
    reviewer flow. The project's existing `/api/seed` route still makes sense (it seeds the app's
    `users` rows + content); it just no longer owns passwords — Auth0's DB connection does.
- **Concrete reviewer answer:** On `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/login`, click
  "Continue" → Auth0 Universal Login → enter `<username>@demo.sml` / `demo1234` in the
  Database-connection form (or click Google). Reviewer lands on `/feed` with the full seeded dataset,
  no onboarding. (Pick one demo username from the seed list, e.g. the first `DemoUser`.)
- **Alternative (Option 2):** Google-only, reviewer uses a personal Google account and goes through
  onboarding. Rejected for a timed review — reviewer may decline to use a personal account, and they'd
  see an empty profile, not the seeded data.

---

## 4. Edge-Middleware Boundary Plan

Today (`src/middleware.ts:1-8`) imports **only** `authConfig` from `auth.config.ts`; gating is the
`authorized` callback (`auth.config.ts:12-23`) using `!!auth?.user`. Must stay Node-free.

Post-Auth0 (Option B) the boundary is preserved because the Auth0 provider and the DB upsert live in
`auth.ts` (Node). Edge changes are **pure token reads only**:
- `authorized` (`auth.config.ts:12`) gains the un-onboarded redirect, reading `auth.user.onboarded`
  (a JWT field — no DB). See §3.4.
- `session`/`jwt` in `auth.config.ts` stay pure (copy token fields only). All DB work is the Node
  `jwt` in `auth.ts`.
- **Hard rules (from CLAUDE.md, unchanged):** `auth.config.ts` must never import `pg`, `bcrypt`,
  `@/lib/db`, or the Auth0 *Management* SDK. Keep `providers: []` in `auth.config.ts:10` and define
  the `Auth0` provider only in `auth.ts` (exactly as `Credentials` is today). Although
  `next-auth/providers/auth0` is itself edge-safe, keeping it out of `auth.config.ts` avoids any risk
  of pulling a provider dependency into the middleware bundle.
- **Verify after Phase 4:** `next build` succeeds and the middleware bundle didn't pull in
  `pg`/`bcrypt`/Node APIs (CLAUDE.md gotcha — a Node import leaking into `auth.config.ts` balloons the
  edge bundle or fails the build).

---

## 5. Config / Secret / URL Changes

### 5.1 Auth0 tenant + application (manual, Auth0 dashboard)
1. Create a **Regular Web Application**.
2. **Authentication → Social → Google:** enable for this app. For production, supply real Google OAuth
   client credentials in Auth0 (Auth0 dev keys are test-only and rate-limited). Ensure the connection
   returns **verified** email (Google does by default).
3. **Authentication → Database:** enable a Database connection and create the demo users (§3.5).
   Require email verification on this connection (so link-by-email adoption is safe).
4. **Application URLs** (use the live run.app URL — verified from
   `cloud-run-public-access-blocked.md`):
   - **Allowed Callback URLs:**
     `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0`
     and the alias `https://mdjamal-app-110062063496.us-central1.run.app/api/auth/callback/auth0`.
     (NextAuth's Auth0 provider callback path is `/api/auth/callback/auth0`.)
   - **Allowed Logout URLs:**
     `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/login` (+ alias). Required if you implement
     federated logout (§8 Q3); harmless to set regardless.
   - **Allowed Web Origins:** both run.app hosts.
   - **Local dev:** add `http://localhost:3000/api/auth/callback/auth0` and `…/login`.

### 5.2 Secret Manager + env vars
New secrets (NOT committed — repo is public, per CLAUDE.md):

| Env var | Secret name (suggested) | Notes |
|---|---|---|
| `AUTH0_CLIENT_ID` | `mdjamal-auth0-client-id` | Auth0 app Client ID |
| `AUTH0_CLIENT_SECRET` | `mdjamal-auth0-client-secret` | **Newline-sensitive — see below** |
| `AUTH0_ISSUER` | `mdjamal-auth0-issuer` | `https://<tenant>.<region>.auth0.com` (the NextAuth Auth0 `issuer`) |
| `NEXTAUTH_SECRET` | existing `mdjamal-nextauth-secret` | **KEEP** — still signs the NextAuth JWT cookie. |
| `NEXTAUTH_URL` | existing env | Stays the real `https://…run.app` URL. |

**Secret-naming check (NextAuth v5 `AUTH_*` vs `NEXTAUTH_*`):** v5 *defaults* to reading
`AUTH_SECRET` and `AUTH_URL`, but this project **explicitly** passes `secret:
process.env.NEXTAUTH_SECRET` and `trustHost: true` in `auth.config.ts:6-7`, overriding the default.
So `NEXTAUTH_SECRET` continues to work — **do not rename it to `AUTH_SECRET`.** Likewise the code
relies on `trustHost: true` (required behind Cloud Run's proxy) plus `NEXTAUTH_URL` for absolute
callback construction; keep both. The Auth0 provider config in `auth.ts` must read
`process.env.AUTH0_CLIENT_ID/SECRET/ISSUER` explicitly (the built-in provider does this by default,
but pass them explicitly to be safe and self-documenting).

**Trailing-newline trap (`nextauth-secret-trailing-newline.md`):** the existing
`mdjamal-nextauth-secret` deliberately ends in `\n` and that's consistent everywhere it's used, so
leave it. **But the NEW Auth0 secrets must NOT have a trailing newline** — a stray `\n` in
`AUTH0_CLIENT_SECRET` makes the OIDC token exchange fail with `invalid_client`. Create them with no
trailing newline, e.g.:
```bash
printf '%s' "$AUTH0_CLIENT_SECRET_VALUE" | \
  gcloud secrets create mdjamal-auth0-client-secret --data-file=- --project=sml-interview-sandbox
```
Verify each is clean: `gcloud secrets versions access latest --secret=mdjamal-auth0-client-secret … | xxd | tail`
— confirm the last byte is **not** `0a`. (Do not build the value via `SECRET=$(…)` substitution,
which silently strips newlines and would mask the check — same pitfall noted in the newline memo.)

Wire all three into Cloud Run via `--update-secrets` / service YAML, same mechanism as existing secrets.

### 5.3 Build-time `allowedOrigins`
`next.config.mjs` `serverActions.allowedOrigins` lists both run.app hosts and is **build-time**
(verified — `next.config.mjs` experimental block; and the public-URL memo notes changing it needs a
Cloud Build + redeploy). The new `/onboarding` server action runs under the *same* origins already
listed, so **no `allowedOrigins` change is needed.** The migration still requires a fresh Cloud Build
+ redeploy anyway (schema + code + new secrets). There is no env-only shortcut for the code changes.

---

## 6. Step-by-Step Sequenced Process

> Each phase is independently committable; `npx tsc --noEmit` + `npm test` must stay green
> (`.git/hooks/pre-push` runs the qa-runner gate). Migrate/seed/deploy mechanics per
> `deploy-and-ralph-playbook.md`; the public URL is live so migrate/seed hit it directly.

**Phase 0 — Tenant prep (no code).** Create the Auth0 Regular Web App; enable Google + a Database
connection; create the demo users in the DB connection (email-verified) (§3.5); set callback/logout/
web-origin URLs (§5.1). Create the three Auth0 secrets with **no trailing newline** (§5.2) and wire
them into Cloud Run.

**Phase 1 — Schema migration.** Append the §3.2 block (two `ADD COLUMN`, the partial unique index,
two `DROP NOT NULL`) to the `SCHEMA` string after `src/app/api/migrate/route.ts:129`. Deploy + run
`/api/migrate` (token = full secret *with* trailing newline, URL-encoded — newline memo). Idempotent.

**Phase 2 — Provider wiring (no new package).** Use `next-auth/providers/auth0`. (`next-auth` already
present.) No `@auth0/nextjs-auth0` install — that's Option A only.

**Phase 3 — Provider swap + token enrichment.**
- `src/lib/auth.ts`: replace `Credentials({…})` (`:11-26`) with
  `Auth0({ clientId, clientSecret, issuer })`. Remove the now-unused `bcrypt`, `query`(if unused
  elsewhere here), and `User`-type imports (`:1-6`) **except** keep `query` — it's needed by the new
  Node `jwt` upsert. Add the Node `jwt` callback from §3.3 (overrides the thin edge `jwt`), spreading
  `...authConfig.callbacks` so `authorized`/`session` are inherited.
- `src/lib/auth.config.ts`: keep callbacks pure; extend `session` (`:28-31`) to also set
  `session.user.onboarded` and (defensively) `session.user.name`; extend `authorized` (`:12-23`) per
  §3.4. **Do not** add a DB-touching `jwt` here.
- `src/types/next-auth.d.ts`: add `onboarded?: boolean` to **both** `Session["user"]` and `JWT`.
  (`name` is already declared on `Session.user`; no change needed there.)

**Phase 4 — Route protection.** Confirm the extended `authorized` callback redirects
authenticated-but-un-onboarded users to `/onboarding` and keeps the auth-page redirect. Run
`next build` and verify the edge bundle is clean (§4).

**Phase 5 — Onboarding flow.** Add `src/app/(main)/onboarding/page.tsx` + `actions.ts`. The server
action:
- Reads `auth()`; requires `session.user.id` and `!session.user.onboarded`.
- Validates `username` (non-empty, server-side), `school` via `isValidSchool`
  (`src/lib/schools.ts:19`), `class_year` via `isValidClassYear` (`src/lib/classYears.ts:13`).
- `UPDATE users SET username=$1, school=$2, class_year=$3, onboarded_at=now()
   WHERE id=$4 AND onboarded_at IS NULL` — catch Postgres `23505` for username collision and return
  `{ error: "Username already taken" }` (mirrors `register/actions.ts:43-44`).
- Follows the mutation contract: return `{ error?: string }`, never throw; call `redirect("/feed")`
  **outside** the try/catch (CLAUDE.md; mirrors `register/actions.ts:50-51`).
- **Session refresh problem (the draft flagged but didn't resolve):** after the UPDATE,
  `token.onboarded` is still `false` in the current JWT, so a naive `redirect("/feed")` bounces the
  user back to `/onboarding` (the `authorized` callback re-checks the stale token). **Recommended
  fix:** the Node `jwt` callback only enriches on first sign-in (`if (account && profile)`); to
  refresh mid-session, call NextAuth v5's session update. Two robust options:
  1. **(Preferred)** Make the Node `jwt` callback also re-read onboarding state when triggered by an
     update: add an `if (trigger === "update") { re-SELECT onboarded_at; token.onboarded = … }`
     branch, and have the onboarding **client** component call `useSession().update()` after the
     action succeeds, then navigate to `/feed`. This flips `token.onboarded` without re-login.
  2. **(Simplest, always works)** After a successful UPDATE, `signOut`-free is impossible to fully
     guarantee, so the fallback is: redirect to `/feed`; if the middleware still sees stale
     `onboarded=false`, force a token refresh by signing the user out and back in is too heavy — so
     prefer option 1. If you want zero client JS, set the `jwt` callback to **always** re-check
     onboarding when the row's `onboarded_at` is unknown — but that adds a DB read to every token
     refresh. Option 1 (update on demand) is the right trade.
  - **State the assumption:** we use option 1 (an `update`-trigger branch in the Node `jwt` + a
    client `update()` call from the onboarding form).

**Phase 6 — Login / register pages + logout.**
- `src/app/(auth)/login/page.tsx`: replace the credentials form + `signIn("credentials", …)`
  (`:3, :20-24`) with a single "Continue" button that calls `signIn("auth0", { redirectTo: "/feed" })`.
  Universal Login (Google + the DB connection) lives on Auth0's side. (During the transition you may
  keep the credentials form behind a flag — §8 Q1.)
- `src/app/(auth)/register/{page.tsx,actions.ts}`: redundant under Auth0 (sign-up happens in Auth0
  Universal Login; profile fields are captured by `/onboarding`). Recommend pointing "create account"
  to the same `signIn("auth0")` and deleting/disabling the local register action. **Note:** until you
  delete it, `register/actions.ts` still imports `bcrypt` and writes `password_hash` — that path is
  dead once the form is gone; remove it in Phase 8 with the rest of bcrypt.
- `src/components/SiteHeader.tsx:133, :248`: `signOut({ redirectTo: "/login" })` keeps working for
  *local* logout. **Federated logout** (also clearing the Auth0/Google SSO session so the next login
  re-prompts) requires redirecting to Auth0's `/v2/logout?client_id=…&returnTo=…` — decide per §8 Q3.

**Phase 7 — Verify identity call sites (the highest-risk port).** With `token.id` and the
**explicitly-overwritten** `token.name = username` (§3.3), the 43 `auth()` invocations and 89
`session.user.id` reads need no changes. **Targeted re-verify that `session.user.name` is the DB
username, not the Google display name**, at the 6 true consumers:
- `src/app/(main)/profile/actions.ts:32, 115, 395, 423` (ownership gate + `revalidatePath`/`redirect`
  build `/profile/${username}`).
- `src/app/(main)/profile/[username]/edit/page.tsx:14` (`session.user.name !== params.username`).
- `src/components/SiteHeader.tsx:14` (truthiness gate for badge counts).
If `token.name` is *not* overwritten, all six silently misbehave (wrong revalidate path, ownership
check fails). This is the single most important check in the migration.

**Phase 8 — Remove credentials / bcrypt.**
- Delete the credentials form + `register/actions.ts`; remove `bcryptjs` + `@types/bcryptjs` from
  `package.json` (`dependencies`/`devDependencies`).
- `seed/route.ts`: remove `bcrypt` (`:2`, `:674`), stop writing `password_hash` (`:686`), stamp
  `onboarded_at = now()` (§3.5).
- After one stable release, drop `password_hash` from the `SCHEMA` string and update
  `src/lib/types.ts:5` to remove it (and make `username: string | null` if still nullable, or
  re-impose `NOT NULL` once all rows are onboarded).

**Phase 9 — Deploy + verify.** Cloud Build → deploy → `/api/migrate` → `/api/seed`
(`deploy-and-ralph-playbook.md`), then run §9 checklist on the live URL.

---

## 7. Inventory of Identity Call Sites (re-verified)

**Counts (re-verified by grep):** 43 `await auth()` invocations across 14 files; 89
`session.user.id` reads; 6 `session.user.name` reads across 2 files (+1 truthiness gate in
SiteHeader). Files using `auth()`:
`messages/{actions.ts,page.tsx,[username]/page.tsx}`, `pokes/actions.ts`, `directory/page.tsx`,
`profile/{actions.ts,[username]/page.tsx,[username]/edit/page.tsx}`, `friends/{actions.ts,page.tsx}`,
`taunts/actions.ts`, `feed/{actions.ts,page.tsx}`, `components/SiteHeader.tsx`.

**Reads `session.user.id` (89 occurrences)** — all stay valid under Option B iff the Node `jwt`
sets `token.id` (§3.3). No edits needed.

**Reads `session.user.name` (HIGH-RISK — must equal DB `username`):**
- `src/app/(main)/profile/actions.ts:32` (auth gate), `:115` (revalidate target), `:395` (auth gate),
  `:423` (`revalidatePath('/profile/${session.user.name}')`).
- `src/app/(main)/profile/[username]/edit/page.tsx:14` (`session.user.name !== params.username`).
- `src/components/SiteHeader.tsx:14` (truthiness gate for badge counts — not rendered).

**Auth plumbing to change:**
- `src/lib/auth.ts:1-28` (provider swap + Node DB-upsert `jwt`).
- `src/lib/auth.config.ts:10-32` (extend `session` + `authorized`; keep edge-safe; keep `providers:[]`).
- `src/middleware.ts` — **no change** (still imports only `authConfig`).
- `src/app/api/auth/[...nextauth]/route.ts` — **no change** (still `export const { GET, POST } = handlers`).
- `src/types/next-auth.d.ts` — add `onboarded?: boolean` to `Session.user` and `JWT`.
- `src/app/(auth)/login/page.tsx:3, :20` and `src/app/(auth)/register/{page.tsx,actions.ts}` — replace
  with Auth0 sign-in.
- `src/app/api/seed/route.ts:2, :674, :686` — drop bcrypt; provision pre-onboarded Auth0-linkable rows.

---

## 8. Risks, Rollback, Open Questions

### Risks
- **`session.user.name` semantics shift (HIGHEST).** OIDC `name` = Google display name; our code
  expects `name` = `username`. Mitigation: overwrite `token.name = row.username` in the Node `jwt`
  (§3.3). If missed: wrong revalidate paths, broken ownership checks (§7).
- **Race on first-login provisioning.** Mitigated by `INSERT … ON CONFLICT (auth0_sub)` (§3.3).
- **Account takeover via unverified-email link.** Mitigated by gating link-by-email on
  `email_verified === true` + requiring verified email on the Auth0 DB connection (§3.3, §5.1).
- **Edge leakage.** A Node import in `auth.config.ts` breaks the middleware build. Keep provider +
  DB in `auth.ts` only (§4).
- **`AUTH0_CLIENT_SECRET` trailing newline → `invalid_client`.** Create with `printf '%s'`, verify no
  `0a` (§5.2).
- **Callback-URL mismatch** across the two run.app hosts → Auth0 error. Register both (§5.1).
- **Stale `onboarded` token after onboarding** → redirect loop. Mitigated by the `update`-trigger
  `jwt` branch + client `update()` (Phase 5).
- **Reviewer login.** Without an Auth0 DB connection there's no password form — reviewer must use
  Google. Mitigated by the seeded DB connection (§3.5).

### Rollback
- **Code:** revert the provider-swap commit; `auth.ts` returns to `Credentials`; login/register pages
  restored. Keep `password_hash` populated (don't run Phase 8) until Auth0 is verified live, so
  credential login still works on rollback. The `auth0_sub`/`onboarded_at` columns are additive and
  harmless if left in place.
- **Infra:** redeploy the prior Cloud Run revision (`--update-traffic` / route 100% to last good
  revision). Auth0 secrets can stay (unused). The `--no-invoker-iam-check` annotation survives a
  redeploy (public-URL memo), so the URL stays anonymous.

### Open questions for the human (with recommended answers)
1. **Credentials fallback during transition?** **Recommend YES for one release** — keep
   `password_hash`/bcrypt and the credentials form behind a flag until Auth0 is verified live, so the
   reviewer always has a working login. Drop in Phase 8.
2. **Reviewer login method?** **Recommend the seeded Auth0 DB connection** (`@demo.sml`/`demo1234`)
   so the reviewer sees the full seeded dataset and skips onboarding (§3.5). Confirm with the human.
3. **Federated logout?** **Recommend deferring** — `signOut({ redirectTo: "/login" })` clears our
   cookie, which is enough for a review. Add Auth0 `/v2/logout?returnTo=…` only if "log out then log
   in" silently reusing the Google SSO session is a problem. (Needs the Allowed Logout URL from §5.1.)
4. **Username collision UX in onboarding.** **Recommend** surfacing the inline `{ error }` (mirrors
   `register/actions.ts:43`); auto-suggesting is gold-plating for an interview app.
5. **Auth0 tenant + Google creds.** Confirm there's a tenant for `sml-interview-sandbox` (or create
   one). Production Google login needs real Google OAuth creds in Auth0 (dev keys are test-only).

---

## 9. Verification Checklist (run on the live URL)

- [ ] `/login` shows the Auth0 "Continue" entry point; the local password form is gone (or only
      behind the transition flag).
- [ ] "Continue" → Universal Login → Google → returns to `…run.app/api/auth/callback/auth0` with a
      valid session (no callback-URL-mismatch on either run.app host).
- [ ] A **brand-new** Google user lands on `/onboarding`, cannot reach `/feed` until submitting a
      valid `username` + `school` (`SCHOOLS`) + `class_year` (`CLASS_YEARS`); on submit a `users` row
      exists with `auth0_sub` set and `onboarded_at` non-null; after success they reach `/feed`
      without a redirect loop (session refreshed).
- [ ] Duplicate username at onboarding returns inline `{ error }` (PG `23505`), no crash.
- [ ] After onboarding, `session.user.id` is the new `users.id` and **`session.user.name` is the
      chosen username** (verify SiteHeader badge counts appear and profile edit ownership works).
- [ ] **Existing data resolves:** the seeded demo reviewer (`@demo.sml`/`demo1234` via the Auth0 DB
      connection) logs in, is adopted via verified link-by-email, **skips onboarding**, and sees their
      existing posts/follows/likes/walls — `users.id` unchanged.
- [ ] Un-verified-email account does **not** adopt an existing row (security check).
- [ ] Protected routes: `/feed` logged-out → `/login`; `/login` logged-in+onboarded → `/feed`;
      logged-in+not-onboarded anywhere → `/onboarding`.
- [ ] `signOut` from SiteHeader returns to `/login` and clears the cookie.
- [ ] `next build` succeeds; middleware bundle did not pull in `pg`/`bcrypt`/Node APIs.
- [ ] `npm test` + `npx tsc --noEmit` green (QA gate).
- [ ] No secrets committed; `AUTH0_*` only in Secret Manager; new secrets verified free of trailing
      `\n` (last byte ≠ `0a`); `NEXTAUTH_SECRET` kept (not renamed to `AUTH_SECRET`).
