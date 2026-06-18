# Auth0 "Dev Keys" warning — findings & fix

**Investigator:** DEVKEYS-INVESTIGATOR (read-only)
**Date:** 2026-06-18
**Branch:** `feat/v2-prisma-auth0`
**Live rev:** `mdjamal-app-00030-nvn` @ 100% traffic (verified).
**Auth0 tenant (verified from `mdjamal-auth0-issuer`):** `https://dev-afe77gumoeorof8u.us.auth0.com`

---

## TL;DR

The **"Dev Keys" warning is essentially benign** — it means your Auth0 **Google social
connection is using Auth0's SHARED development OAuth client** instead of your own Google
Cloud OAuth credentials. It does NOT cause the `/onboarding` "Continue does nothing" bug
(that is two unrelated, already-diagnosed app bugs — H1 + H2, see below). It **can plausibly
contribute to the intermittent Google "Oops, something went wrong"** page, because the shared
keys are globally rate-limited and flaky. Replacing them with your own Google OAuth client is
the correct production fix and removes the warning.

---

## (a) What the "Dev Keys" warning means

Auth0's hosted **Google social connection** ships with a built-in, **Auth0-owned Google OAuth
client** ("development keys") so you can click "Sign in with Google" the moment you enable the
connection — no Google Cloud project required. The warning

> "One or more of your connections are currently using Auth0 development keys"

is Auth0 telling you that connection is still on those shared keys. Characteristics of dev keys:

- **Shared across every Auth0 tenant on the planet** → subject to a global, low rate limit.
- **No custom OAuth consent screen** — the Google consent dialog shows Auth0's branding /
  `auth0.com`, not your app name.
- **Not supported for production** by Auth0; explicitly flagged as test-only.
- **Limited / inconsistent scopes & refresh-token behaviour.**
- **Occasionally flaky** — because they're shared and rate-limited, bursts of traffic (or just
  bad luck) can return transient OAuth errors.

It is a *warning*, not an error. Google login still works most of the time on dev keys; Auth0
just wants you to swap in your own client before going to production.

---

## (b) Could dev keys cause the Google "Oops, something went wrong"?

**Likelihood: PLAUSIBLE but not the most likely root cause — assess as MODERATE.**

The "Oops, something went wrong" page is served by Auth0 itself (on the
`dev-afe77gumoeorof8u.us.auth0.com` domain) **before** control returns to our app. That tells us
the failure is **inside the Auth0 ↔ Google OAuth exchange**, not in our Next.js callback. Two
candidate causes:

1. **Dev-key rate limiting / transient flakiness (MODERATE).** Shared dev keys are globally
   throttled; under load or intermittently they return OAuth errors that Auth0 surfaces as the
   generic "Oops" page. This matches the user's "*sometimes*" — an intermittent, not-deterministic,
   Auth0-domain error is the classic signature of dev-key flakiness. Replacing the keys removes
   this class of failure.

2. **A misconfigured callback / connection (also possible).** If the Google connection or the
   tenant callback URL is off, you'd also get an Auth0-domain error — but that would tend to be
   *deterministic* (fails every time), not "sometimes". The intermittent nature points more at #1.

**Conclusion:** dev keys are a credible contributor to the intermittent "Oops". They are NOT
the cause of the `/onboarding` "Continue does nothing" loop — that bug reproduces with plain
credential signup (symptom #3), which never touches Auth0 or Google at all.

---

## How this relates to the other symptoms (scoping — NOT this task's fix)

To keep the user oriented, the `/onboarding` bug is **separate** from dev keys and has two
confirmed app-side causes (file evidence below). Fixing dev keys will NOT fix onboarding.

- **H1 — CONFIRMED (root cause of symptom #3, the credential-signup loop).**
  `src/app/(auth)/register/actions.ts` creates the user (lines 39–47) but **never sets
  `onboardedAt`**. So every freshly-registered credential user has `onboardedAt = NULL` →
  `token.onboarded = false` → the edge `authorized` callback
  (`src/lib/auth.config.ts:36`) force-routes them to `/onboarding`. They already gave
  username/school/class_year at registration, so this gating is wrong.
  Contrast: the **seed** stamps `onboardedAt` (`src/app/api/seed/route.ts:704`), which is
  exactly why demo login `thefacebook_tom@demo.sml` skips onboarding and "just works".
  *Likely fix (out of scope here): set `onboardedAt: new Date()` in the register create, and
  have the credentials `authorize()` already returns `onboarded: user.onboardedAt !== null`.*

- **H2 — PLAUSIBLE (the "Continue does nothing" non-navigation, affects both paths).**
  `src/app/onboarding/page.tsx:27-32` calls `update().then(() => router.push("/feed"))`. If the
  refreshed JWT's `token.onboarded` doesn't propagate to the edge middleware cookie before the
  navigation, the `authorized` callback (`auth.config.ts:38`) sees stale `onboarded=false` and
  302-bounces `/feed` → `/onboarding`, i.e. "Continue does nothing". The Node `jwt` "update"
  branch (`src/lib/auth.ts:164-173`) does re-read `onboardedAt`, so the logic is right; the risk
  is cookie/edge propagation timing. Needs a runtime repro to confirm vs. refute.

- **H3 — VERIFIED DEPLOYED.** The email-collision crash fix (jwt callback resolving by verified
  email, `src/lib/auth.ts:85-108`, instead of a naive create) is present in the codebase and the
  live revision is `00030-nvn` at 100% traffic. The persisted-row symptom (#4 — couldn't reuse
  `myjamal2005@gmail.com`) is consistent with this branch creating/adopting a row on first Auth0
  login.

---

## (c) EXACT step-by-step: replace dev keys with your own Google OAuth credentials

> You (the human) must do this in the browser — it spans Google Cloud Console and the Auth0
> dashboard, neither of which is scriptable from this repo. Use the **exact** redirect URI below.

### Part 1 — Create the Google OAuth client (Google Cloud Console)

1. Go to **Google Cloud Console** → <https://console.cloud.google.com/> and pick (or create) a
   project for this. (It can be your existing `sml-interview-sandbox` project or a personal one —
   the Google OAuth client is independent of the Cloud Run app.)
2. **APIs & Services → OAuth consent screen.**
   - User type: **External** → Create.
   - App name: e.g. `SML Social Network`; user support email: your email; developer contact: your
     email. Save and continue.
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough — no need to add more. Continue.
   - **Test users:** while the app is in "Testing" publishing status, **add every Google account
     you'll log in with as a test user** (e.g. `myjamal2005@gmail.com`). Accounts NOT on this list
     get "access blocked" / "Oops". Continue → Back to dashboard.
   - (Optional, later: click **Publish app** to allow any Google account — for a demo, leaving it
     in Testing + test-user list is fine.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
   - Application type: **Web application**.
   - Name: e.g. `auth0-mdjamal`.
   - **Authorized redirect URIs → Add URI**, paste EXACTLY (no trailing slash, no spaces):
     ```
     https://dev-afe77gumoeorof8u.us.auth0.com/login/callback
     ```
     (This is your verified tenant domain `dev-afe77gumoeorof8u.us.auth0.com` + Auth0's fixed
     `/login/callback` path. A mismatch here is `redirect_uri_mismatch` → the "Oops" page.)
   - **Authorized JavaScript origins** can be left empty for this server-side flow.
   - Click **Create**. Copy the **Client ID** and **Client Secret** from the dialog.

### Part 2 — Paste them into Auth0

4. Go to the **Auth0 Dashboard** → <https://manage.auth0.com/> → select the
   `dev-afe77gumoeorof8u` tenant.
5. **Authentication → Social → Google** (the `google-oauth2` connection).
6. Paste your **Client ID** into **Client ID** and your **Client Secret** into **Client Secret**
   (replacing the blank/dev-key state).
7. (Optional) Under **Permissions**, keep `email` and `profile` checked.
8. Click **Save Changes**. The "development keys" warning for this connection disappears.
9. **Applications tab of the Google connection** (or **Authentication → Social → Google →
   Applications):** make sure the toggle for your Auth0 Regular Web App (the one whose Client ID is
   `rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn`, secret in `mdjamal-auth0-client-id`) is **enabled**, or
   Google login won't be offered to our app.

### Part 3 — Verify

10. No code or Cloud Run redeploy is needed — this is entirely an Auth0/Google config change; our
    app only knows `AUTH0_ISSUER` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET`, none of which change.
11. Open the live app → "Sign in with Google". You should now see **your** app name on the Google
    consent screen (not Auth0 branding), and the intermittent "Oops" from dev-key throttling should
    be gone.

> NOTE: this change does NOT fix the `/onboarding` "Continue does nothing" loop (H1/H2). Those are
> app-code fixes tracked separately.

---

## Evidence index (files read)

- `src/lib/auth.ts` — Auth0 + Credentials providers; Node `jwt` callback (email-collision fix
  L85-108, update branch L164-173).
- `src/lib/auth.config.ts` — edge `authorized` (onboarding gate L36-39) + `session` callbacks.
- `src/app/onboarding/page.tsx` — `update().then(router.push)` pattern (L27-32).
- `src/app/onboarding/actions.ts` — onboard action returns `{ok:true}`, sets `onboardedAt`.
- `src/app/(auth)/register/actions.ts` — **does NOT set `onboardedAt`** (H1 root cause).
- `src/app/api/seed/route.ts:704` — seed DOES set `onboardedAt` (why demo login skips onboarding).
- `prisma/schema.prisma:55` — `onboardedAt DateTime? @map("onboarded_at")`.

### Verified via gcloud
- Live traffic: `mdjamal-app-00030-nvn` 100% (latest ready = same).
- `mdjamal-auth0-issuer` = `https://dev-afe77gumoeorof8u.us.auth0.com` (the `dev-` tenant → dev keys).
- `mdjamal-auth0-client-id` = `rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn`.
