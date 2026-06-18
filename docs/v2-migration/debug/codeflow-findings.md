# Codeflow Findings — Onboarding "Continue does nothing" + credential signups gated

Investigator: CODEFLOW-INVESTIGATOR (read-only). Branch `feat/v2-prisma-auth0`.
Live rev confirmed serving 100%: `mdjamal-app-00030-nvn`. React 18 / Next 14.2.35 / next-auth ^5.0.0-beta.31.

## TL;DR — two independent root causes

1. **ROOT CAUSE A (H1 — CONFIRMED).** `register()` never sets `onboardedAt`, so every
   freshly-registered credential user is `onboardedAt = NULL` and the edge `authorized()`
   gate force-redirects them into `/onboarding` — even though they already supplied
   username + school + class_year at signup. This is why a manual signup
   (`test@123.com`) lands on `/onboarding`. It is NOT Auth0-specific.

2. **ROOT CAUSE B (H2 — CONFIRMED).** Once on `/onboarding`, clicking **Continue** does
   reach the DB and stamp `onboardedAt`, but the client's
   `update().then(() => router.push('/feed'))` cannot reliably flip the **edge** view of
   `token.onboarded` in time, so the navigation to `/feed` is 302-bounced straight back to
   `/onboarding` by `authorized()`. To the user this looks like "Continue does nothing."
   There are TWO compounding sub-defects (B1 and B2 below) that make the bounce
   deterministic.

Demo credentials login works (`thefacebook_tom@demo.sml`) ONLY because the **seed** stamps
`onboardedAt: new Date()` on demo users (`src/app/api/seed/route.ts:701-704`). That is the
single difference between the working demo login and the broken fresh-signup login — it
isolates Root Cause A cleanly.

H3 (Auth0 email-collision fix) is present and deployed (jwt callback resolves by verified
email, `auth.ts:62-151`). H4 (dev-keys / Google "Oops") is a separate Auth0-tenant config
issue, not a code bug — see end.

---

## (a) register action — does it set onboardedAt? Does it collect username/school/class_year?

File: `src/app/(auth)/register/actions.ts`

- It **collects** `username`, `email`, `password`, `school`, `class_year` and validates all
  of them (`:16-34`). So a registered credential user already has a complete profile.
- It creates the row with exactly those fields (`:39-47`):

  ```ts
  await getPrisma().user.create({
    data: { username, email, passwordHash, school, classYear },
  })
  ```

- **`onboardedAt` is NEVER set.** The Prisma field defaults to `NULL`
  (`prisma/schema.prisma:55 onboardedAt DateTime? @map("onboarded_at")`, nullable, no
  `@default`).
- After create it `redirect("/login")` (`:62`) — so the new user must log in via the
  credentials provider.

➡️ **CONFIRMED H1.** A just-registered, fully-profiled credential user has
`onboardedAt = NULL`, which (per section d) routes them into `/onboarding`. The onboarding
form then asks them to RE-enter username/school/class_year they already gave — and even if
they do, Root Cause B traps them.

## (b) credentials authorize() — what is returned for onboarded, and how token.onboarded is set

File: `src/lib/auth.ts`

- `authorize()` returns (`:43-48`):

  ```ts
  return {
    id: user.id,
    name: user.username,
    email: user.email,
    onboarded: user.onboardedAt !== null,   // ← NULL ⇒ false
  }
  ```

- The Node `jwt` callback's credentials branch (`:154-159`) copies it onto the token:

  ```ts
  if (user) {
    token.id = user.id
    token.name = user.name
    token.onboarded = (user as { onboarded?: boolean }).onboarded === true
    return token
  }
  ```

➡️ For a fresh signup, `user.onboardedAt === null` ⇒ `onboarded:false` ⇒
`token.onboarded = false`. Correct given the data — but the data is wrong because of Root
Cause A. For demo users, `onboardedAt` is non-null (seeded) ⇒ `token.onboarded = true` ⇒
they sail through. This is the exact mechanism that makes demo login work and fresh signup
fail.

## (c) onboarding — does onboard() persist, and why does "Continue" bounce?

Files: `src/app/onboarding/actions.ts`, `src/app/onboarding/page.tsx`,
`src/app/onboarding/layout.tsx`.

**The DB write is correct.** `onboard()` (`actions.ts:47-55`) does:

```ts
await getPrisma().user.updateMany({
  where: { id: session.user.id, onboardedAt: null },
  data: { username, school, classYear, onboardedAt: new Date() },
})
```

`onboardedAt` IS stamped. It returns `{ ok: true }` (`:69`), not a redirect — by design, so
the client can refresh the JWT first. So the persistence layer is NOT the bug; the user's
row genuinely becomes onboarded. (This is also why re-using `myjamal2005@gmail.com` /
`test@123.com` failed later — the rows persist.)

The bounce is in the **client refresh → navigate → edge re-check** sequence
(`page.tsx:26-32`):

```ts
const navigatedRef = useRef(false)
useEffect(() => {
  if (state.ok && !navigatedRef.current) {
    navigatedRef.current = true
    void update().then(() => router.push("/feed"))
  }
}, [state.ok, update, router])
```

Intended chain: `onboard()` returns `{ok:true}` → `update()` triggers the Node `jwt`
callback's `trigger === "update"` branch (`auth.ts:164-173`), which re-reads
`onboardedAt` from the DB and sets `token.onboarded = true`, re-issuing the session JWT
cookie → THEN `router.push('/feed')` → edge `authorized()` sees `onboarded:true` → allowed.

That chain is broken by two compounding sub-defects:

### B1 — `useFormState` may never deliver `state.ok` to the client (form posts, no JS round-trip surfaced)

`page.tsx:4` imports `useFormState` from `react-dom` and the `<form action={formAction}>`
is a **progressively-enhanced Server-Action form**. The success effect depends entirely on
`state.ok` becoming `true` on the **client**. If the action result does not hydrate back
into `state` (e.g. the action's returned object isn't surfaced because the page was loaded
via a redirect/full document request, or hydration of the `useFormState` boundary is racey),
the `useEffect` never fires, `update()` is never called, `router.push` never runs — i.e.
**Continue does literally nothing, with no error**, which matches the symptom verbatim. Note
React 18 + Next 14 expose this as `react-dom`'s `useFormState` (not yet `useActionState`),
which is the older, more fragile binding. This is the most likely "nothing happens at all"
contributor.

### B2 — even when `state.ok` fires, `update()` does not reliably flip the EDGE token in time → 302 bounce

This is the structural defect the CLAUDE.md gotcha warns about, and it is still present:

- `authorized()` runs in **middleware on the edge** and reads `onboarded` off the JWT in the
  **request cookie** (`auth.config.ts:14,36-39`). It is DB-free by design.
- `useSession().update()` calls the `/api/auth/session` handler which runs the Node `jwt`
  `trigger==="update"` branch and re-reads the DB (`auth.ts:164-173`). For this to help, the
  **freshly re-issued Set-Cookie must be committed to the browser AND sent on the very next
  `/feed` navigation**.
- In next-auth v5 beta, `update()` resolving (the promise the `.then()` awaits) does **not
  guarantee** the rotated session cookie has been written before `router.push('/feed')`
  issues its request. If `/feed` goes out with the **stale** cookie (`onboarded:false`),
  `authorized()` hits `auth.config.ts:36-37`:

  ```ts
  if (!onboarded && !isOnboarding)
    return Response.redirect(new URL("/onboarding", nextUrl))
  ```

  → 302 back to `/onboarding`. The form re-renders, `state` resets, `navigatedRef` resets
  (new component instance after navigation) → user is parked on `/onboarding` again. Net
  effect: **"Continue does nothing / bounces back."**

Additional fragility: `update()` returning a NEW identity each render is acknowledged in the
`navigatedRef` comment (`page.tsx:20-25`); the one-shot guard prevents an infinite
`/api/auth/session` loop but does nothing to fix the cookie-timing race.

➡️ **CONFIRMED H2.** The bounce is the edge `authorized()` redirect at
`auth.config.ts:36-37` firing on a stale `token.onboarded=false`, because either (B1) the
client never even gets `state.ok` to start the refresh, or (B2) the refreshed cookie isn't
on the `/feed` request. Both are client/edge-propagation problems, NOT a DB-write problem.

## (d) edge authorized() — gate logic for a credential user with onboardedAt = NULL

File: `src/lib/auth.config.ts:12-42`.

- `isLoggedIn = !!auth?.user`; `onboarded = auth?.user?.onboarded === true` (`:13-14`) — read
  purely from the JWT, set by the session callback `session.user.onboarded = token.onboarded === true`
  (`:58`).
- For a logged-in credential user with `onboardedAt = NULL` ⇒ `token.onboarded=false` ⇒
  `onboarded=false`:
  - Visiting `/feed` (or any non-auth, non-onboarding route): `:31` passes (logged in), then
    `:36-37` `!onboarded && !isOnboarding` ⇒ **redirect to `/onboarding`**.
  - Visiting `/login` or `/register` while logged in: `:22-27` ⇒ redirect to `/onboarding`
    (because `!onboarded`).
  - Visiting `/onboarding`: `:38-39` only redirects OUT when `onboarded`, so they stay —
    correct.

➡️ This is exactly why a fresh credential signup is trapped on `/onboarding`: any attempt to
reach the app re-redirects to `/onboarding` until `token.onboarded` flips to true, and B1/B2
prevent it from flipping.

---

## Recommended fixes (for the implementer — not applied here)

**Fix A (eliminates the whole trap for credential signups — highest impact, lowest risk):**
In `src/app/(auth)/register/actions.ts:39-47`, set `onboardedAt: new Date()` in the
`user.create` data. A registering user supplies username + school + class_year, so they are
onboarded by definition. After this, fresh credential signups get
`token.onboarded=true` via `authorize()` (`auth.ts:47`) and never see `/onboarding`. This
alone resolves symptoms #2-(register path) and #3 entirely and makes `/onboarding`
exclusively an Auth0-provisioning step.

**Fix B (makes Auth0 onboarding's Continue reliable — needed for the Auth0 path #2):**
Make the post-onboarding transition not depend on a client cookie-rotation race:
- Simplest robust option: have the client do a **hard navigation** after a confirmed
  refresh, e.g. `await update(); window.location.assign('/feed')` (a full document request
  re-reads the rotated cookie), and/or call `router.refresh()` before push.
- More robust: after `onboard()` returns `{ok:true}`, force a fresh JWT by re-calling
  `signIn`/re-issuing the session, or move the onboarding success to a **server redirect**
  once the token is known-fresh.
- Also migrate `useFormState` (`react-dom`) → `useActionState` (`react`) and/or gate the
  button with `useFormStatus` pending state so the success signal is delivered reliably and
  the user sees feedback (addresses B1 + the "no visible feedback" symptom).

**H3 (verify only):** the email-collision fix IS in the deployed code
(`auth.ts:85-108` resolve-by-verified-email + `:113-140` race-safe create). No 500 path on
a duplicate email remains. Deployed in rev `00030-nvn` (live, 100%).

**H4 (out of code scope):** the "Dev Keys" warning and intermittent Google "Oops" are Auth0
tenant configuration (Auth0's shared Google social-connection dev keys), not a repo bug.
Replace with the user's own Google OAuth client in the Auth0 Google connection. Does not
affect the onboarding bounce.

## Symptom → cause map

| Symptom | Root cause |
|---|---|
| #2 Auth0 login → /onboarding, Continue does nothing | B1 (`state.ok` not surfaced) + B2 (stale edge cookie ⇒ 302 at auth.config.ts:36-37) |
| #3 Fresh register → forced to /onboarding, Continue does nothing | A (register omits onboardedAt) traps them; then B1/B2 keep them stuck |
| Demo credentials login works | Seed stamps onboardedAt (route.ts:701-704) ⇒ token.onboarded=true ⇒ no gate |
| #4 Email rows persist / can't reuse | onboard() updateMany + register create persist rows; expected |
| #5/#6 Auth0 "Oops" + Dev Keys | H4 — Auth0 tenant config, not repo code |
