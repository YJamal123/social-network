# IMPLEMENTATION — Onboarding loop fix

Executes the code fixes in `DIAGNOSIS.md`. Two app-code root causes (A: register
never stamped `onboardedAt`; B: no-arg `update()` → GET → JWT never refreshed)
caused the entire onboarding trap/loop for both credential and Auth0 users.

## Files changed

1. **`src/app/(auth)/register/actions.ts`** (Fix 1 — root cause A).
   Added `onboardedAt: new Date()` to the `user.create` data. Manual registration
   already collects username/school/class_year, so the row is fully provisioned.
   `authorize()` already returns `onboarded: user.onboardedAt !== null`
   (`src/lib/auth.ts:47`), so freshly-registered credential users now return
   `onboarded:true` and are NOT gated into `/onboarding`. No `auth.ts` change
   needed. Resolves symptom #3 entirely.

2. **`src/app/onboarding/page.tsx`** (Fix 2 — root cause B; required for the Auth0 path).
   - Changed `void update().then(() => router.push("/feed"))`
     to `void update({ onboarded: true }).then(() => window.location.assign("/feed"))`.
   - Removed the now-unused `useRouter` import and `router` local.
   - Kept the existing `navigatedRef` one-shot guard and the `useEffect`
     gated on `state.ok` (the action still returns `{ ok: true }`, not a redirect).

3. **`src/app/api/debug/users/route.ts`** — DELETED (Fix 4). Temporary token-guarded
   debug route created during diagnosis. `/api/debug/users` is gone from the build
   manifest; it now 404s in production. (The directory `src/app/api/debug/` was
   removed too.)

## Onboarding JWT-refresh mechanism used

next-auth `5.0.0-beta.31`: a **no-arg** `update()` issues a `GET /api/auth/session`,
which does NOT set `trigger:"update"` in the jwt callback — so our DB re-read of
`onboardedAt` (`src/lib/auth.ts:164-173`) never runs, and the cookie is re-signed
with the stale `onboarded:false`, bouncing the user back to `/onboarding`.

The fix calls `update({ onboarded: true })` with a **defined arg**, which forces a
`POST /api/auth/session` → `trigger:"update"` → the jwt callback re-reads
`onboardedAt` from the DB and re-signs the cookie `onboarded:true`. (The object
content is ignored; the callback re-reads the DB — it does not trust client input.)
Then a **hard** navigation `window.location.assign("/feed")` (instead of
`router.push`) guarantees the edge middleware sees the fresh cookie and sidesteps
the client-side `loading` no-op race in next-auth's `react.js`.

The rev-00030 Auth0 verified-email resolve-before-create fix (`src/lib/auth.ts:85-140`)
is left fully intact (H3 — already deployed & working).

## Schema

No schema or migration change. `onboardedAt` already exists (nullable, no default)
from `20260618000000_auth0_columns`. The `mdjamal-migrate` Job was NOT run.
No user data deleted.

## Gates (all PASS)

- `npx prisma generate` — OK
- `npx tsc --noEmit` — clean
- `npm test` (vitest) — 7 files, 64 tests passed
- `npm run build` (DB-less next build) — succeeded; 17/17 static pages; middleware
  79 kB (edge-clean); no `/api/debug` route in the manifest.

`src/lib/auth.config.ts` and `src/middleware.ts` were NOT touched — edge bundle
stays free of pg/bcrypt/@prisma/client/getPrisma.

## Deploy

- Image built via Cloud Build (digest `sha256:7a0a682f…`), deployed to Cloud Run.
- **New revision: `mdjamal-app-00032-g9f`** — serving 100% of traffic
  (no `update-traffic` needed; landed at 100%).
- No `mdjamal-migrate` Job run (no schema change).

## Smoke test results (live, rev 00032-g9f)

- `GET /api/health` → `200` `{"ok":true}`.
- `GET /api/debug/users?token=…&onboardedNull=1` → `404` (debug route removed).
- Credentials login `thefacebook_tom@demo.sml` / `demo1234`:
  `POST /api/auth/callback/credentials` → `302`; `/api/auth/session` returns
  `{name:"thefacebook_tom", onboarded:true, …}`; `GET /feed` → `200` with NO
  redirect to `/login` or `/onboarding`. Login still works.
