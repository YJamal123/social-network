# DIAGNOSIS — Onboarding loop + Auth0/Google "Oops" + Dev-keys warning

**Lead diagnostician synthesis** of five parallel investigations (codeflow, dbstate,
auth0side, sessionupdate, devkeys). Branch `feat/v2-prisma-auth0`. Live rev at time of
investigation: `mdjamal-app-00030-nvn` / `00031-rvn` (100% traffic). Next 14.2.35, React 18,
next-auth `5.0.0-beta.31`.

All five investigators independently reached the **same two code root causes** with
file:line evidence, plus live Cloud Run log proof and live DB row proof. There is no
disagreement between reports.

---

## Root causes (confirmed)

### Root cause A — Register never stamps `onboardedAt` (symptom #3)
`src/app/(auth)/register/actions.ts` `user.create` (≈L39-47) writes
`{ username, email, passwordHash, school, classYear }` but **never sets `onboardedAt`**.
The Prisma column is nullable with no default (`prisma/schema.prisma:55`). So every fresh
credential signup is `onboardedAt = NULL`. Credentials `authorize()` returns
`onboarded: user.onboardedAt !== null` → `false` (`src/lib/auth.ts:47`), and the edge gate
`authorized()` (`src/lib/auth.config.ts:36-37`) force-redirects them to `/onboarding` — even
though they already supplied username + school + class_year at registration.

Demo login works ONLY because the seed stamps `onboardedAt: new Date()`
(`src/app/api/seed/route.ts:701-704`). That single seed line is the exact difference between
working demo login and broken fresh signup — it isolates Root Cause A cleanly.

**DB proof:** `test@123.com` and `test@gmail.com` rows have `hasPassword=true, auth0Sub=null`
(register fingerprint); `test@gmail.com` is the lone `onboardedAt IS NULL` row — the user who
gave up inside the loop.

### Root cause B — `update()` is called with NO arguments → GET, not POST → token never refreshes (symptom #2, the bounce)
`src/app/onboarding/page.tsx` (≈L26-32) does `void update().then(() => router.push("/feed"))`.
The `onboard()` action DOES write `onboardedAt` to the DB (`src/app/onboarding/actions.ts:47-55`,
verified — both problem rows have it SET), so the DB is **not** the bug. The bug is JWT/edge
propagation:

- In next-auth `5.0.0-beta.31`, `update()` **with no argument** issues a **GET**
  `/api/auth/session`; only `update(<defined arg>)` issues a **POST**. Traced through installed
  source: `node_modules/next-auth/react.js:340` (`data === undefined → req undefined`),
  `node_modules/next-auth/lib/client.js:28` (`req?.body → POST`, else GET),
  `node_modules/@auth/core/lib/index.js:37/59` (GET → isUpdate falsy; POST → isUpdate true),
  `node_modules/@auth/core/lib/actions/session.js:30` (`...(isUpdate && { trigger:"update" })`).
- Our Node `jwt` callback re-reads the DB and flips `token.onboarded` **only inside the
  `trigger === "update"` branch** (`src/lib/auth.ts:164-173`). On a GET there is no
  `trigger:"update"`, so the cookie is re-signed with the **stale `onboarded:false`**.
- `router.push("/feed")` then sends the stale cookie; the edge `authorized()`
  (`src/lib/auth.config.ts:36-37`) sees `onboarded=false` → 302 back to `/onboarding`.
- **Live log proof (rev 00030):** after each successful login a storm of
  `GET /onboarding 200` + `GET /api/auth/session 200`, and **NO `POST /api/auth/session`
  anywhere** — the update POST never happens. To the user: "Continue does nothing / bounces."

Secondary hazard: `react.js:340` `if (loading) return;` — `update()` is a silent no-op if a
session fetch is in flight, so even the no-arg GET can be skipped entirely. Mitigated by the
hard-navigation fallback below.

Note: Root cause A *hides* B for the register path (a stamped register user never reaches
onboarding), but **B must still be fixed** for the Auth0 path, which legitimately has no
username on first login and must onboard.

---

## H1–H4 verdicts

| Hyp | Verdict | Evidence |
|---|---|---|
| **H1** register omits `onboardedAt` | **CONFIRMED** | `register/actions.ts:39-47` (all 5 reports); DB `test@*` rows have `auth0Sub=null,hasPassword=true`; demo seed stamps it (`seed/route.ts:704`). |
| **H2** onboarding refresh doesn't propagate | **CONFIRMED — exact mechanism found** | `update()` no-arg → GET → no `trigger:"update"` (sessionupdate traced installed source). Live logs: only GET, never POST `/api/auth/session`. DB rows already onboarded yet user looped → not a DB bug. |
| **H3** Auth0 email-collision 500 fixed | **CONFIRMED DEPLOYED & WORKING** | `auth.ts:85-140` verified-email resolve-before-create live in rev 00030; callback returns clean 302, no `error=Configuration`, no `/api/auth/error` in 3h. DB: `myjamal2005@gmail.com` = one row, real `auth0Sub`, no `*@auth0.local` synthetic/duplicate. |
| **H4** dev-keys benign / relates to "Oops" | **CONFIRMED** | Tenant `dev-afe77gumoeorof8u…` (`dev-` prefix = Auth0 shared Google OAuth dev keys). Benign warning; does NOT cause the onboarding loop (loop reproduces on pure credential signup). MODERATE contributor to the intermittent "Oops" via shared-key rate-limiting. |

---

## FIX PLAN (prioritized)

### CODE FIXES (Implement phase)

**Fix 1 — stamp onboarding at registration (Root cause A / H1). Highest impact, lowest risk.**
File: `src/app/(auth)/register/actions.ts`. In the `user.create` data, add `onboardedAt: new Date()`:
```ts
await getPrisma().user.create({
  data: { username, email, passwordHash, school, classYear, onboardedAt: new Date() },
})
```
No change needed in `auth.ts` — `authorize()` already returns `onboarded: user.onboardedAt !== null`,
which becomes `true` once the column is set. This fully resolves symptom #3 and makes `/onboarding`
exclusively an Auth0-provisioning step.

**Fix 2 — make onboarding "Continue" reliably refresh the JWT (Root cause B / H2). Required for the Auth0 path #2.**
File: `src/app/onboarding/page.tsx`. Minimal, lowest-risk one-line change — replace:
```ts
void update().then(() => router.push("/feed"))
```
with:
```ts
void update({ onboarded: true }).then(() => window.location.assign("/feed"))
```
Why this works: a **defined arg** forces a **POST** `/api/auth/session` → `trigger:"update"` →
the Node `jwt` callback (`auth.ts:164-173`) re-reads `onboardedAt` from the DB and re-signs the
cookie with `onboarded:true`. The hard `window.location.assign("/feed")` guarantees the edge
middleware sees the freshly-set cookie and sidesteps the `if (loading) return` no-op race. (The
object *content* is ignored by our callback — it re-reads the DB — so `{ onboarded: true }` is
purely self-documenting; `{}` would also work.)

Optional hardening (from sessionupdate findings) — await and verify before navigating:
```tsx
useEffect(() => {
  if (!state.ok || navigatedRef.current) return
  navigatedRef.current = true
  ;(async () => {
    const refreshed = await update({ onboarded: true })
    if (refreshed?.user?.onboarded) router.replace("/feed")
    else window.location.assign("/feed")
  })()
}, [state.ok, update, router])
```

**Fix 3 — reliability/feedback polish (optional, addresses the "no feedback at all" feel of B1).**
File: `src/app/onboarding/page.tsx`. Migrate `useFormState` (`react-dom`) → `useActionState`
(`react`) and add `useFormStatus` pending state on the Continue button so the success signal is
delivered reliably and the user sees a pending state. Not strictly required if Fix 2 lands, but
removes the "Continue does literally nothing, no error" perception risk.

**Fix 4 — cleanup (Implement phase).**
- Remove the temporary debug route `src/app/api/debug/users/route.ts` (committed `6eeaf38`, left
  deployed by the dbstate investigator for this phase to remove).
- Optionally clean test artifact rows `test@gmail.com` and `test@123.com`. **Must preserve demo
  users** (`*@demo.sml`) and the real `myjamal2005@gmail.com` identity.

**Verification after deploy:** watch Cloud Run logs for a **`POST /api/auth/session`** (currently
absent) followed by a single clean **`GET /feed 200`** with no re-redirect to `/onboarding`.

### HUMAN-ONLY ACTIONS (Auth0 dashboard / Google Cloud — NOT code, no redeploy)

These cannot be scripted from the repo (no Auth0 Management API creds). Tenant
`dev-afe77gumoeorof8u`, app client id `rYwBNDhnQsH1B4hOdAOpUgukF2vP7TAn`.

**Symptom #5 — Google "Oops" (MODERATE likelihood = dev-key flakiness; verify config too):**
- [ ] App → Settings → **Allowed Callback URLs** contains EXACTLY
      `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app/api/auth/callback/auth0` (no trailing slash).
- [ ] App → **Allowed Logout URLs** + **Allowed Web Origins** = `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app`.
- [ ] Authentication → Social → Google → **Applications** tab: toggle **ON** for this app.
- [ ] Actions → **Login** flow: no custom Action that `throw`s / `api.access.deny`.
- [ ] Read **Auth0 → Monitoring → Logs** for the exact failed-exchange reason behind "Oops".

**Symptom #6 — Dev-keys warning (benign; replace for production, also clears the dev-key class of "Oops"):**
- [ ] Google Cloud Console → APIs & Services → **OAuth consent screen** (External): add test users
      incl. `myjamal2005@gmail.com`.
- [ ] **Credentials → Create OAuth client ID → Web application**; Authorized redirect URI EXACTLY
      `https://dev-afe77gumoeorof8u.us.auth0.com/login/callback`.
- [ ] Copy Client ID/Secret → Auth0 → Authentication → Social → Google → paste → Save.
- [ ] Confirm the connection is enabled for the app.
No code change or Cloud Run redeploy — the app only knows `AUTH0_ISSUER/CLIENT_ID/CLIENT_SECRET`,
none of which change.

**Minor (non-fatal, note only):** the OIDC discovery `issuer` ends with `/` while the
`AUTH0_ISSUER` secret has none. Not currently breaking logins (callback 302s). Only add the
trailing slash if a future `openid-client` bump starts failing on `iss` mismatch.

---

## Symptom → cause → fix map

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | Demo credentials login works | Seed stamps `onboardedAt` → `token.onboarded=true` | (working baseline; no action) |
| 2 | Auth0 login → /onboarding, Continue does nothing | Root cause B: `update()` no-arg → GET → stale cookie → edge 302 | **Fix 2** (code) |
| 3 | Fresh register → forced /onboarding, Continue does nothing | Root cause A traps them; then Root cause B keeps them stuck | **Fix 1** (eliminates trap) + Fix 2 |
| 4 | Email rows persist / can't reuse | `onboard()` updateMany + register create persist rows; expected (email UNIQUE) | not a bug; optional artifact cleanup (Fix 4) |
| 5 | Auth0/Google "Oops" (intermittent, Auth0 domain) | H4: dev-key flakiness (MODERATE) + possible callback/connection config | **Human Auth0/Google actions** |
| 6 | "Dev Keys" warning | H4: Auth0 shared Google OAuth dev client | **Human: own Google OAuth client** |

**Bottom line:** two app-code bugs (A: register `onboardedAt`; B: `update()` no-arg GET) cause
the entire onboarding trap/loop for both credential and Auth0 users — fix both. H3 is already
fixed and live. The "Oops" and dev-keys items are Auth0/Google dashboard config, separate from
the loop, and do not require a code change or redeploy.
