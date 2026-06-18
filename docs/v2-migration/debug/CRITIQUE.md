# CRITIQUE — onboarding loop fix

**Verdict: PASS-WITH-NOTES**

Reviewed commit `3e9cbe5` against the live deployment `mdjamal-app-00032-g9f` (100% traffic).
Both code root causes are correctly fixed, the runtime mechanism for the onboarding
refresh is verified against the actual installed library source (not just asserted),
edge-safety is intact, the debug route is gone, security gating is preserved, and all
gates are green. The NOTES are pre-existing HUMAN-ONLY Auth0/Google dashboard items the
implementer correctly scoped out — they do not affect the onboarding loop and are not
code-actionable.

## Verification results

### (a) Register stamps onboardedAt — PASS
`src/app/(auth)/register/actions.ts:49` sets `onboardedAt: new Date()` in `user.create`.
Credentials `authorize()` (auth.ts:47) already returns `onboarded: user.onboardedAt !== null`,
and the Node jwt credentials branch (auth.ts:154-159) copies it to `token.onboarded`.
A fresh credential signup therefore mints a token with `onboarded:true` → edge `authorized`
(auth.config.ts:36) does NOT redirect to `/onboarding`. Symptom #3 closed.

### (b) Onboarding completion reliably flips onboarded — PASS (mechanism verified at the library level)
This is the load-bearing claim. Traced end-to-end against the **actual installed**
next-auth `5.0.0-beta.31` (confirmed version), not from memory:

1. `onboard()` action (`onboarding/actions.ts:47`) awaits `updateMany(... onboardedAt:null → onboardedAt:new Date())`
   then returns `{ok:true}`. DB is committed BEFORE the client effect fires.
2. Effect (`onboarding/page.tsx:36-41`) gates on `state.ok`, one-shot via `navigatedRef`,
   calls `update({ onboarded: true })`.
3. `node_modules/next-auth/react.js:336-342`: `update(data)` with a **defined** `data`
   passes `{ body: { csrfToken, data } }` to `fetchData`. With no-arg it passes `undefined`.
4. `node_modules/next-auth/lib/client.js:28-30`: `if (req?.body) { options.method = "POST" }`.
   → defined-arg ⇒ **POST** `/api/auth/session`; no-arg ⇒ GET. The POST handler is what sets
   `trigger:"update"` in the jwt callback. The report's central claim is **correct**.
5. jwt callback `trigger === "update"` branch (auth.ts:164-173) re-reads `onboardedAt` from
   the DB and re-signs the cookie `onboarded:true`. Client input is ignored (good — not
   spoofable).
6. `window.location.assign("/feed")` forces a full document load so the edge middleware
   reads the freshly-signed cookie, sidestepping the client `loading` no-op race.

`useRouter`/`router` fully removed from the page (no stray refs). No other no-arg `.update()`
calls exist in `src` (remaining grep hits are all comments). Type augmentation for
`onboarded` on User/Session/JWT present (`src/types/next-auth.d.ts`).

Caveat (not a defect): I could not perform a live Auth0/Google interactive browser login
(no IdP credentials available headless), so step 5's runtime cookie flip is verified by
source-trace + the credentials smoke test, not by an end-to-end Auth0 click-through. The
mechanism is sound; a human should do one real Auth0 "Continue" to confirm before calling it
shipped.

### (c) Auth0 collision fix + edge-safety intact — PASS
- auth.ts:85-140 resolve-before-create (verified-email adoption, synthetic-email fallback,
  P2002 race recovery) is unchanged from rev-00030.
- `grep` for `pg|bcrypt|@prisma/client|getPrisma|@/lib/db` in `auth.config.ts` and
  `middleware.ts`: only a comment match in auth.config.ts; **no real imports**. Edge stays clean.

### (d) Debug route deleted + 404 live — PASS
`src/app/api/debug/` directory gone. `git show 3e9cbe5` shows `route.ts` deleted (-82 lines).
Live `GET /api/debug/users` → **404**.

### (e) No security regression — PASS
`email_verified` gating preserved: auth.ts:68 `verified = profile.email_verified === true`,
auth.ts:85 `if (!row && verified && email)` — unverified emails still cannot adopt/log into an
existing row (account-takeover guard intact). Onboarding re-read trusts the DB, not the
client-supplied `update()` payload.

### (f) Gates green — PASS
`npx tsc --noEmit` → exit 0. `npm test` → 7 files, **64/64 pass**. Working tree clean
(matches deployed commit). Live `GET /api/health` → 200.

## Required follow-ups
None blocking. Recommended before declaring the Auth0 path fully shipped:

1. **HUMAN:** Perform one real Auth0 "Continue" click-through on /onboarding to confirm the
   cookie flip end-to-end (source-trace verified; live IdP click not done headless).
2. **HUMAN (symptom #5):** Auth0 "Oops, something went wrong" — Application callback URL /
   allowed origins config in the Auth0 dashboard. No code.
3. **HUMAN (symptom #6):** Replace Auth0 shared Google "dev keys" with the user's own Google
   OAuth client for production. No code.
4. **NOT pushed** (per instructions) — commit `3e9cbe5` is local only.
