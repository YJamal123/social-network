# Onboarding bounce — `useSession().update()` investigation

**Date:** 2026-06-18 · **Branch:** `feat/v2-prisma-auth0` · **Status:** root cause found, two concrete bugs.

## TL;DR

Two independent bugs combine into the "Continue does nothing" bounce:

1. **(H1 — CONFIRMED) Register never stamps `onboardedAt`.** Freshly-registered
   credential users (who already gave username/school/class_year) are wrongly
   gated into `/onboarding`. This is why the bug reproduces for a plain manual
   signup (`test@123.com`), not just Auth0.

2. **(H2 — CONFIRMED, exact mechanism found) `update()` is called with NO
   arguments.** In next-auth `5.0.0-beta.31`, `update()` with no args issues a
   **GET** `/api/auth/session`, which runs the `jwt` callback **without
   `trigger:"update"`**. Our `auth.ts` jwt callback only re-reads the DB
   (`token.onboarded`) inside the `trigger === "update"` branch — so on a GET it
   returns the token unchanged. `token.onboarded` stays `false`, the freshly
   re-signed cookie still says `onboarded:false`, and the very next
   `router.push('/feed')` is 302-bounced by the edge `authorized` callback back
   to `/onboarding`. **The fix is to call `update({})` (a defined arg), which
   issues a POST and DOES trigger the server re-read.**

H3 (Auth0 crash-proof fix) is deployed and is NOT the cause of the bounce.
H4 (Auth0 dev-keys / Google "Oops") is a separate, benign-but-fix-later issue.

---

## (a) Installed version

- `node_modules/next-auth/package.json` → **`5.0.0-beta.31`**
- `package.json` → `"next-auth": "^5.0.0-beta.31"`
- Core engine: `@auth/core` (vendored under `node_modules/@auth/core`).

## (b) Does no-arg `update()` trigger the server `jwt` callback with `trigger:"update"`? — NO.

Traced through the actual installed source:

**Client — `node_modules/next-auth/react.js`, `update(data)` (lines 336-352):**

```js
async update(data) {
  if (loading) return;                       // (!) early no-op if a fetch is in flight
  setLoading(true);
  const newSession = await fetchData("session", __NEXTAUTH, logger,
    typeof data === "undefined"
      ? undefined                            // no-arg  -> req = undefined
      : { body: { csrfToken: await getCsrfToken(), data } }); // arg -> req.body set
  setLoading(false);
  ...
}
```

**Client — `node_modules/next-auth/lib/client.js`, `fetchData` (lines 28-31):**

```js
if (req?.body) {                  // only a defined body promotes the request
  options.body = JSON.stringify(req.body);
  options.method = "POST";
}                                 // else: plain GET, no body
```

So: `update()` → `data === undefined` → `req === undefined` → **GET**.
`update({})` → `req.body` set → **POST**.

**Server route — `node_modules/@auth/core/lib/index.js` (lines 25-59):**

```js
if (method === "GET") {
  ...
  case "session":
    return await actions.session(options, sessionStore, cookies);          // isUpdate = undefined  (falsy)
} else {                                                                     // POST
  case "session":
    validateCSRF(action, csrfTokenVerified);
    return await actions.session(options, sessionStore, cookies, true, request.body?.data); // isUpdate = true
}
```

**Session action — `node_modules/@auth/core/lib/actions/session.js` (lines 28-32, 46-51):**

```js
const token = await callbacks.jwt({
  token: payload,
  ...(isUpdate && { trigger: "update" }),   // <-- only present when isUpdate (POST)
  session: newSession,
});
...
const newToken = await jwt.encode({ ...jwt, token, salt });        // re-sign
const sessionCookies = sessionStore.chunk(newToken, { expires }); // Set-Cookie
response.cookies?.push(...sessionCookies);
```

**Conclusion:** the `jwt` callback runs on BOTH GET and POST and the cookie is
re-signed on both. But `trigger:"update"` is passed **only on POST**. Our
`auth.ts` jwt callback's DB re-read is gated behind `trigger === "update"`
(auth.ts line 164), so a no-arg `update()` (GET) re-signs a cookie that still
carries the stale `onboarded:false`. Verified arg→method mapping empirically:

```
update(undefined) -> GET  (NO trigger)
update({})        -> POST (trigger:update)
update({x:1})     -> POST (trigger:update)
update(null)      -> POST (trigger:update)
```

Secondary hazard: `if (loading) return;` (react.js:340). If a background
`getSession`/poll/visibility fetch is in flight when the effect fires, `update()`
returns `undefined` **immediately without any network call at all**, then
`.then(() => router.push('/feed'))` runs against the *still-stale* token →
guaranteed bounce. So even switching to `update({})` should not assume the
refresh always happened — see the recommended pattern.

## (c) Does the post-`update()` navigation carry the refreshed cookie to the edge middleware? — YES, *if* a POST happened.

On the POST path, `@auth/core` re-encodes the JWT and pushes `Set-Cookie`
(session.js:46-51). `fetch` applies the `Set-Cookie` to the document cookie jar
**before** the awaited promise resolves, so by the time `.then()` runs, the
browser already holds the new `authjs.session-token`. `router.push('/feed')`
then sends that cookie; `middleware.ts` → `auth.config.ts authorized()` decodes
`token.onboarded === true` and lets the user into `/feed`.

The propagation gap is therefore **not** cookie timing — it is purely that the
GET path never refreshed `token.onboarded` in the first place. (A soft client
`router.push` after a real POST is fine; no hard reload needed.)

---

## Root-cause summary per symptom

| # | Symptom | Cause |
|---|---------|-------|
| 2 | Auth0 → /onboarding, Continue does nothing | `update()` no-arg → GET → stale `onboarded:false` → /feed bounces back (H2) |
| 3 | Manual signup also lands on /onboarding | Register never sets `onboardedAt` → token `onboarded:false` from first login (H1). Then same H2 bounce on Continue. |
| 4 | Can't reuse an Auth0-attempt email for signup | Expected: Auth0 jwt provisioning created a row with that email; `email` UNIQUE → register P2002. Not a bug in this flow. |
| 5 | Auth0 "Oops" page | H4 — Auth0 dev-keys / Google connection; separate from the bounce. |
| 6 | "Dev Keys" warning | H4 — benign; replace Auth0's shared Google dev OAuth with your own creds for prod. |

H3 verified deployed: live rev **mdjamal-app-00030-nvn** (built 2026-06-18
20:21 UTC) corresponds to commit `3ef7a9c` "crash-proof Auth0 identity
resolution" (16:17 EDT); the later debug-route commit `6eeaf38` is NOT deployed.
The infinite-loop guard `89e5159` is also in this rev — note it only fixed the
loop *symptom* (one-shot ref), not the stale-token root cause.

---

## (d) Recommended fix (most reliable)

### Fix 1 — stamp onboarding at registration (H1)

`src/app/(auth)/register/actions.ts`, in the `user.create` data:

```ts
await getPrisma().user.create({
  data: {
    username,
    email,
    passwordHash,
    school,
    classYear,
    onboardedAt: new Date(),   // <-- registered users already gave the profile
  },
})
```

And mark them onboarded immediately in the credentials `authorize()` return so
the very first login's JWT is correct — `src/lib/auth.ts` already returns
`onboarded: user.onboardedAt !== null`, so no change needed there once the
column is set. (Demo seed users already have `onboarded_at` stamped.)

### Fix 2 — make onboarding completion reliably refresh the JWT (H2)

`src/app/onboarding/page.tsx` — call `update` with an explicit object (forces the
POST + `trigger:"update"`), guard against the `loading` no-op, and fall back to a
hard navigation so the user can never be stranded:

```tsx
const navigatedRef = useRef(false)
useEffect(() => {
  if (!state.ok || navigatedRef.current) return
  navigatedRef.current = true
  ;(async () => {
    // Pass a defined arg: update({}) -> POST /api/auth/session with
    // trigger:"update", which re-runs the Node jwt callback's DB re-read and
    // re-signs the cookie with onboarded:true. update() (no arg) is a GET and
    // would NOT flip token.onboarded -> the user bounces back here.
    const refreshed = await update({ onboarded: true })
    // Hard navigation guarantees the freshly-set cookie is sent to the edge
    // middleware and sidesteps the react.js `if (loading) return` no-op race
    // (where update() returns undefined without ever hitting the server).
    if (refreshed?.user?.onboarded) {
      router.replace("/feed")
    } else {
      window.location.assign("/feed")
    }
  })()
}, [state.ok, update, router])
```

Notes:
- The `data` passed to `update({...})` is forwarded to the jwt callback as
  `session` — our callback ignores it and re-reads the DB instead, so the
  *content* of the object doesn't matter; `{}` works. `{ onboarded: true }` is
  just self-documenting.
- `window.location.assign('/feed')` is the bulletproof fallback: a full document
  load re-reads the (now-correct) cookie at the edge regardless of any
  client-side session-context staleness. If you want maximum reliability with
  zero cleverness, you can make `window.location.assign('/feed')` the *only*
  navigation after `await update({...})` — the cookie is already set by then, so
  the edge `authorized` check passes and there is no bounce.

### Minimal, lowest-risk variant

If you want the smallest possible diff: change the one line in the existing
effect from

```ts
void update().then(() => router.push("/feed"))
```

to

```ts
void update({ onboarded: true }).then(() => window.location.assign("/feed"))
```

That alone fixes the bounce (POST → trigger:update → fresh cookie; hard nav
guarantees the edge sees it). Pair it with Fix 1 so registered users don't get
sent to onboarding at all.

### H4 (separate follow-up, not the bounce)

Replace Auth0's shared Google "dev keys" with your own Google OAuth client in
the Auth0 Google social connection to clear the warning and the intermittent
Google "Oops". This is unrelated to the onboarding bounce and can be done later.
