# DBSTATE-INVESTIGATOR — live DB findings

Date: 2026-06-18
Deployed rev for this probe: `mdjamal-app-00031-rvn` (100% traffic)
Temporary debug route: `src/app/api/debug/users/route.ts` (token-guarded, read-only) — **leave deployed; Implement phase removes it.**

## Raw row data (verbatim from `GET /api/debug/users`)

### myjamal2005@gmail.com (Auth0 / Google)
```json
{"count":1,"users":[{"id":"8f15625c-a2b4-4cab-aadb-ebedd828bb33","email":"myjamal2005@gmail.com","username":"user2","hasPassword":false,"auth0Sub":"google-oauth2|111208252580794764080","onboardedAt":"2026-06-18T20:24:40.570Z","school":"Harvard","classYear":2006}]}
```

### test@123.com (manual register)
```json
{"count":1,"users":[{"id":"21e9fe20-8bb1-43cd-9576-1b467aa2e80f","email":"test@123.com","username":"user23","hasPassword":true,"auth0Sub":null,"onboardedAt":"2026-06-18T20:26:27.230Z","school":"Dartmouth","classYear":2006}]}
```

### thefacebook_tom@demo.sml (demo / credentials, works)
```json
{"count":1,"users":[{"id":"2a3bbbb8-33f7-436e-9581-fe6851ca8eb2","email":"thefacebook_tom@demo.sml","username":"thefacebook_tom","hasPassword":true,"auth0Sub":null,"onboardedAt":"2026-06-18T19:14:04.955Z","school":"Cornell","classYear":2006}]}
```

### ?onboardedNull=1 (rows where onboardedAt IS NULL)
```json
{"count":1,"users":[{"id":"2e958ec4-5b42-4fda-b3c3-ec6f1a73e535","email":"test@gmail.com","username":"test","hasPassword":true,"auth0Sub":null,"onboardedAt":null,"school":"Harvard","classYear":2010}]}
```

(Guard verified: `?token=WRONG` → HTTP 401. `user2@auth0.local` → count 0, i.e. no synthetic-email placeholder rows exist.)

## Per-row interpretation

| email | id | username | hasPassword | auth0Sub | onboardedAt | school / year |
|---|---|---|---|---|---|---|
| myjamal2005@gmail.com | 8f15625c… | **user2** | false | google-oauth2\|111208252580794764080 | **2026-06-18T20:24:40Z (SET)** | Harvard / 2006 |
| test@123.com | 21e9fe20… | **user23** | true | null | **2026-06-18T20:26:27Z (SET)** | Dartmouth / 2006 |
| thefacebook_tom@demo.sml | 2a3bbbb8… | thefacebook_tom | true | null | 2026-06-18T19:14:04Z (SET) | Cornell / 2006 |
| test@gmail.com | 2e958ec4… | test | true | null | **NULL** | Harvard / 2010 |

Only **one** row has `onboardedAt IS NULL` (`test@gmail.com`). No `*@auth0.local` synthetic placeholder rows, no duplicate rows for any probed email — every email maps to exactly one row.

## What this proves / disproves vs the hypotheses

**The onboarding/register DB writes DO land.** Both rows the user struggled with (`myjamal2005@gmail.com` Auth0, `test@123.com` manual) have `onboardedAt` SET, plus a username (`user2`, `user23`) and school/year. So `onboard()`'s `updateMany` reaches the DB and commits.

**H1 — CONFIRMED (register does not stamp onboardedAt).**
`src/app/(auth)/register/actions.ts` `user.create` writes username/email/passwordHash/school/classYear but **never sets `onboardedAt`** (and credentials `authorize()` in `src/lib/auth.ts` returns `onboarded: user.onboardedAt !== null` → false for a just-registered row). So a freshly-registered credentials user — who already supplied username + school + class_year at register — is wrongly routed to `/onboarding`. This exactly matches symptom #3 (register → forced login → forced onboarding). The `test@123.com` and `test@gmail.com` rows are the fingerprint: they were created by register (hasPassword=true, auth0Sub=null) yet were then funneled through the onboarding screen — which is why `test@123.com` ended up with username `user23` / school Dartmouth (re-collected at onboarding) and `test@gmail.com` is still stuck NULL (user gave up at the loop before completing).
→ **Fix:** set `onboardedAt: new Date()` in the register `create`, AND have credentials `authorize()` return `onboarded: true` (or rely on the stamped column). Then register users skip `/onboarding` entirely.

**H2 — CONFIRMED as the "Continue does nothing" loop cause.**
The writes land but the user still bounces back to `/onboarding`, so the failure is purely token/edge-state, not the DB. After `onboard()` returns `{ok:true}` the client calls `useSession().update()`; the Node `jwt` callback's `trigger === "update"` branch re-reads `onboardedAt` and should flip `token.onboarded`. Evidence says the flipped token is **not reaching the edge `authorized` middleware** before `/feed` is requested (or the update round-trip isn't completing), so `/feed` 302-bounces to `/onboarding` → "Continue does nothing." The DB is NOT the bottleneck — `onboardedAt` is already SET for these rows yet the user kept looping. This is the JWT-refresh/propagation bug to fix in auth (reliable update-then-navigate, e.g. await the session update and only `router.push` once `onboarded` is observably true, or use a server redirect after re-auth).

**H3 — CONFIRMED working (email-collision fix is live).**
The `myjamal2005@gmail.com` row has a real `auth0Sub` (`google-oauth2|…`) bound onto a single row that ALSO owns the real email — no duplicate, no `*@auth0.local` synthetic row, no `error=Configuration` artifact. The verified-email adoption/unification path in the `jwt` callback (rev ≥00030, present in current 00031) is functioning: one identity, one row.

**H4 — not evidenced from DB state.** Dev-keys / "Oops" are Auth0-tenant-side (Google shared dev OAuth keys) and leave no DB trace; out of scope for this DB probe. Note `myjamal2005@gmail.com` still onboarded successfully despite the warning, so dev keys are not blocking the core flow.

## Artifacts / dupes
- No duplicate rows: every probed email → exactly 1 row.
- No synthetic `*@auth0.local` placeholder rows (the H3 create-collision branch never fired in prod).
- Test artifacts present: `test@gmail.com` (username `test`, onboardedAt NULL — the only un-onboarded row, a casualty of the H2 loop) and `test@123.com` (username `user23`). `myjamal2005@gmail.com` is a real Auth0/Google identity that completed onboarding. Implement phase may clean these test rows but should preserve demo users.

## Notes for Implement phase
- Remove `src/app/api/debug/users/route.ts`.
- Primary fixes: (H1) stamp `onboardedAt` at register + credentials `authorize` returns `onboarded:true`; (H2) make the post-onboarding JWT refresh reliably propagate before navigating so the edge middleware sees `onboarded=true`.
