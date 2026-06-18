# Auth0-side Investigation Findings

**Investigator:** AUTH0SIDE-INVESTIGATOR (read-only on code)
**Date:** 2026-06-18
**Service:** `mdjamal-app`, rev `mdjamal-app-00030-nvn` (100% traffic, latest = serving)
**Live URL:** https://mdjamal-app-ttc7jxtqgq-uc.a.run.app
**next-auth:** `^5.0.0-beta.31`

---

## TL;DR — Two independent, confirmed bugs

1. **PRIMARY (H2 confirmed): the onboarding "Continue does nothing" is a JWT-refresh loop.**
   `useSession().update()` is **NOT issuing a POST to `/api/auth/session`**, so the
   Node `jwt` "update" branch never runs, `token.onboarded` stays `false` in the
   cookie, and the edge `authorized` callback 302-bounces `/feed` → `/onboarding`
   forever. **Live logs prove it** (see Evidence §D).
2. **SECONDARY (H1 confirmed): freshly *registered* credential users are wrongly gated into onboarding.**
   `register()` never sets `onboardedAt`, so every new credential user (who already
   supplied username/school/class_year) hits `/onboarding` and then trips bug #1.

These are **NOT Auth0 bugs.** The Auth0 OIDC round-trip itself is healthy (H3 confirmed:
no `error=Configuration` 500s on rev 00030). The "Oops" page and dev-keys warning are
**separate Auth0-dashboard issues** the human must fix (H4 — see §F).

---

## A. Auth0 OIDC discovery — HEALTHY (investigation item a)

`curl https://dev-afe77gumoeorof8u.us.auth0.com/.well-known/openid-configuration`:

| field | value |
|---|---|
| issuer | `https://dev-afe77gumoeorof8u.us.auth0.com/` **(trailing slash)** |
| authorization_endpoint | `https://dev-afe77gumoeorof8u.us.auth0.com/authorize` |
| token_endpoint | `https://dev-afe77gumoeorof8u.us.auth0.com/oauth/token` |
| userinfo_endpoint | `https://dev-afe77gumoeorof8u.us.auth0.com/userinfo` |
| jwks_uri | `https://dev-afe77gumoeorof8u.us.auth0.com/.well-known/jwks.json` |

All endpoints resolve. Tenant is up.

### Minor note — issuer trailing-slash mismatch (NOT currently fatal)
- Discovery `issuer` ends with `/`.
- Our `AUTH0_ISSUER` secret = `https://dev-afe77gumoeorof8u.us.auth0.com` **(no slash)**.
- NextAuth/`openid-client` performs discovery off the issuer URL and validates the
  `iss` claim against the **discovered** value, so the no-slash env works (the live
  `/api/auth/callback/auth0` returned **302 success** — §D). Leave it as-is unless a
  future `openid-client` bump tightens iss matching; if Auth0 logins ever start
  failing with an `iss` mismatch, add the trailing slash.

## B. Cloud Run env wiring — CORRECT (investigation item b)

`gcloud run services describe ... --format=export`:

```
AUTH0_CLIENT_ID      → secret mdjamal-auth0-client-id
AUTH0_CLIENT_SECRET  → secret mdjamal-auth0-client-secret
AUTH0_ISSUER         → secret mdjamal-auth0-issuer
NEXTAUTH_SECRET      → (set)
NEXTAUTH_URL         → (set)
```

All three Auth0 vars are wired as secret refs (values not printed). `src/lib/auth.ts`
reads exactly these (`process.env.AUTH0_CLIENT_ID/SECRET/ISSUER`). Provider config is
correct.

## C. H3 — email-collision Configuration-500 fix — DEPLOYED & WORKING

- Rev `00030-nvn` is the only revision, 100% traffic.
- Live log: `20:24:31  302  /api/auth/callback/auth0?code=...` → **clean 302, no 500**.
- No `error=Configuration` and no `/api/auth/error` hits in the last 3h.
- The `jwt` callback's verified-email resolve-before-create logic (auth.ts:62–151) is
  live. **H3 confirmed fixed.**

## D. H2 — THE onboarding loop — ROOT CAUSE CONFIRMED (investigation item d)

### Live evidence (rev 00030, 2026-06-18 ~20:24–20:26 UTC)
After a successful credential/Auth0 login that lands on `/onboarding`, the logs show a
**tight burst** of:
- `GET /onboarding` → 200  (×many, sub-second apart)
- `GET /api/auth/session` → 200  (×many)

…and then it just repeats. **Critically: every `/api/auth/session` hit is a `GET`.
There is NO `POST /api/auth/session` anywhere in the window.**

### Why that is the bug
- In NextAuth **v5**, `useSession().update()` works by issuing a **POST** to
  `/api/auth/session`. That POST is the ONLY thing that fires the `jwt` callback with
  `trigger: "update"` (auth.ts:164–173), which re-reads `onboardedAt` from the DB and
  **re-issues the session cookie** with `token.onboarded = true`.
- The logs contain **only GET** `/api/auth/session` (passive session reads) — the
  update POST never reaches the server. So:
  1. `onboard()` action writes `onboardedAt` to the DB — **succeeds** (the row really
     is onboarded; this is why the email "could not be reused", symptom #4).
  2. Client effect calls `update().then(() => router.push("/feed"))`.
  3. `update()` produces no cookie refresh → JWT still says `onboarded:false`.
  4. `router.push("/feed")` → edge middleware `authorized` (auth.config.ts:36) sees
     `onboarded=false` → `Response.redirect("/onboarding")`.
  5. `/onboarding` re-renders → `useSession()` gives a new identity → effect guard
     (`navigatedRef`) already true, but the SessionProvider keeps refetching → the
     GET `/api/auth/session` + `/onboarding` storm seen in the logs.
- Net user-visible effect: **Continue appears to do nothing / bounces back to
  /onboarding** — exactly symptoms #2 and #3.

### Contributing factors / why the update() POST is missing
- `SessionProvider` is scoped only to `/onboarding` (onboarding/layout.tsx) with **no
  `basePath`**. Default basePath is `/api/auth`, which matches NextAuth's route, so
  that alone shouldn't break it — but combined with the v5-beta `update()` semantics
  and a `useFormState` action that returns `{ok:true}` (not passing fresh session data
  into `update(data)`), the refresh is unreliable.
- `update()` called with **no argument** in v5-beta does POST in principle, but the
  absence of any POST in the logs means it is effectively a no-op here (most likely the
  provider's update path is short-circuiting because the session it holds is the stale
  edge-issued one, or the promise resolves from cache without a network round-trip).

### Recommended fix (for the FIXER, not done here — read-only role)
Make the onboarding completion **not depend on a client-side JWT refresh succeeding**.
Options, best first:
1. **Server-redirect after a forced cookie refresh.** Have the `onboard()` action, on
   success, set `onboardedAt` AND return enough for the client to call
   `update({ onboarded: true })` (pass data so the `jwt` callback's `session` arg /
   `trigger:"update"` path actually re-stamps the token), THEN `router.push`/
   `router.refresh`. Verify a **POST `/api/auth/session`** appears in logs after the fix.
2. **Re-issue the session server-side.** After the DB write, call NextAuth's
   `unstable_update` (v5) from the server action, or sign the user back in, so the new
   cookie is set by the server response rather than relying on the browser `update()`.
3. **Belt-and-suspenders:** make the edge `authorized` callback NOT hard-loop — e.g.
   allow `/feed` to render and let a server component there read the DB once and
   `revalidate`, instead of a pure-JWT bounce. (Heavier; only if 1–2 prove flaky.)

Any fix MUST be verified by watching for a **POST `/api/auth/session`** (currently
absent) and a single clean `/feed` 200 in Cloud Run logs.

## E. H1 — register() never sets onboardedAt — CONFIRMED

`src/app/(auth)/register/actions.ts` `user.create({ data: { username, email,
passwordHash, school, classYear } })` — **no `onboardedAt`** → defaults to NULL →
`onboardedAt !== null` is false → credentials `authorize()` returns `onboarded:false`
(auth.ts:47) → edge gates the user to `/onboarding`, where they hit bug H2.

This is why **symptom #3** (manual signup with `test@123.com` also lands on onboarding
and Continue does nothing) is NOT Auth0-specific.

### Recommended fix (for the FIXER)
In `register()`, set `onboardedAt: new Date()` on create (the user already provided
username/school/class_year, so onboarding has nothing to collect). With that, fresh
credential users skip `/onboarding` entirely and never touch bug H2. (Fixing H1 hides
H2 for the register path, but **H2 must still be fixed** for the Auth0 path, which has
no username at first login and legitimately needs onboarding.)

## F. H4 + the Auth0 "Oops" page — DASHBOARD ACTIONS FOR THE HUMAN (item c)

We have **no Auth0 Management API creds**, so the dashboard cannot be inspected
programmatically. The "Oops, something went wrong" page renders on the
`dev-afe77gumoeorof8u.us.auth0.com` domain **before** control returns to our
`/api/auth/callback/auth0`, so it is an **Auth0-tenant-side** failure, independent of
our code. Likely causes, with the exact checks the human must perform in the Auth0
dashboard (tenant `dev-afe77gumoeorof8u`):

1. **Allowed Callback URLs missing/!exact.**
   Applications → (the Regular Web App, client id = `mdjamal-auth0-client-id`) →
   Settings → **Allowed Callback URLs** must contain **exactly**:
   `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0`
   (no trailing slash, https). Also set **Allowed Logout URLs** =
   `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app` and **Allowed Web Origins** =
   same origin. A missing/typo'd callback is the #1 cause of the Auth0 "Oops".

2. **Google social connection enabled for THIS app.**
   Authentication → Social → Google (google-oauth2) → **Applications** tab → ensure
   the toggle is **ON** for this specific application. If Google is enabled tenant-wide
   but not for this app, Universal Login offers it then errors on callback → "Oops".

3. **Dev-keys Google connection (H4).**
   The "One or more of your connections are currently using Auth0 development keys"
   banner means the Google connection uses **Auth0's shared dev OAuth client**. Dev
   keys: (a) only work from Auth0's Universal Login on the dev domain, (b) are rate-
   limited and flaky, (c) **break `prompt`/`offline_access` and some redirect flows** →
   a frequent source of the intermittent Google "Oops".
   **Fix:** create a Google Cloud OAuth 2.0 **Web** client, set its Authorized redirect
   URI to `https://dev-afe77gumoeorof8u.us.auth0.com/login/callback`, then in Auth0 →
   Authentication → Social → Google → paste the real **Client ID/Secret** (replacing
   dev keys). This clears the banner AND most likely fixes the Google "Oops".

4. **Post-login Action / Rule throwing.**
   Actions → Library / Flows → **Login** flow: if any custom Action `throw`s or calls
   `api.access.deny(...)`, Auth0 shows "Oops" before redirecting back. Check the Login
   flow is empty or non-throwing. (Monitoring → Logs in the dashboard will show the
   exact `f`/`feacft`/`fsa` failed-exchange or failed-login event with a reason —
   the human should read **Auth0 → Monitoring → Logs** for the precise error string.)

5. **Database connection enabled for the app** (if signups via the Auth0 DB connection
   are expected): Authentication → Database → Username-Password-Authentication →
   Applications → toggle ON for this app; and Settings → ensure "Disable Sign Ups" is
   off if self-service signup is wanted.

### Human dashboard checklist (copy/paste)
- [ ] App → Allowed Callback URLs contains exactly `…/api/auth/callback/auth0`
- [ ] App → Allowed Logout URLs + Allowed Web Origins set to the Cloud Run origin
- [ ] Social → Google → Applications: ON for this app
- [ ] Replace Google **dev keys** with a real Google OAuth client (redirect URI =
      `https://dev-afe77gumoeorof8u.us.auth0.com/login/callback`)
- [ ] Actions → Login flow: no Action that throws / denies
- [ ] Database connection enabled for the app (if DB signups expected)
- [ ] Read **Monitoring → Logs** for the exact "Oops" event reason

## G. Items checked and RULED OUT
- ❌ Auth0 OIDC discovery / endpoints down — all healthy (§A).
- ❌ Auth0 env vars missing/mis-wired on Cloud Run — correct (§B).
- ❌ `error=Configuration` 500 on the callback (the old collision bug) — gone (§C).
- ❌ Auth0 callback failing — it returns 302 success (§C/§D).
- ❌ Issuer trailing-slash currently breaking logins — not breaking (callback 302s) (§A).

## H. Evidence appendix (raw, rev 00030, last ~3h UTC)
```
20:24:31  302  /api/auth/callback/auth0?code=…        ← Auth0 OIDC success, no 500
20:24:31  GET  /api/auth/session  200
20:24:40  GET  /api/auth/session  200
20:25:00–20:25:10  GET /onboarding 200 (×~20) + GET /api/auth/session 200 (×many)
20:26:09  200  /api/auth/callback/credentials?        ← credential login success
20:26:10  GET  /onboarding 200  →  burst of GET /onboarding + GET /api/auth/session
ERROR (severity-only, empty payload) ×6 — NOT Configuration 500s, no message body
NO  POST /api/auth/session anywhere ← the missing update() that breaks onboarding
```
