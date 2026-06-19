---
description: Drive a real browser (Playwright MCP) through the live site, clicking the actual UI to verify the core flows work end-to-end.
---

You are running a real-browser UI walkthrough of the SML Social Network using the **Playwright MCP** browser tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_select_option`, `browser_take_screenshot`, `browser_wait_for`, etc.). Actually CLICK the UI — do not fall back to curl/HTTP. After each step take a snapshot (and a screenshot for anything notable) and record PASS/FAIL with what you observed.

## Target
- Base URL: `https://mdjamal-app-ttc7jxtqgq-uc.a.run.app` (override if the user passed a different URL in $ARGUMENTS).
- Demo credentials login: `thefacebook_tom@demo.sml` / `demo1234`.

## Walkthrough steps (do them in order; keep going on a failure, just record it)

1. **Anonymous redirect.** Navigate to `/feed`. EXPECT: redirected to `/login`. Snapshot.
2. **Login page renders.** Confirm the login form (email + password) AND a "Continue with Auth0" button are present.
3. **Credentials login.** Type the demo email + password, submit. EXPECT: land on `/feed`, demo posts visible. Screenshot.
4. **Create a post.** Find the post composer, type a unique status (include a timestamp-ish token so you can find it), submit. EXPECT: the new post appears at the top of the feed without a full reload error. Screenshot.
5. **Like + comment.** On a post, click the like button (confirm the count changes), then open comments, add a comment, submit, confirm it shows. 
6. **Profile.** Navigate to your own profile (e.g. via the header/avatar). Confirm username, friend count, and posts render. Try the profile edit page; confirm fields load.
7. **Directory / people.** Open the directory or people search; confirm a list of users renders and a search filter works.
8. **Messages.** Open messages/conversations; open a thread; confirm the message list renders. (Sending is optional — if quick, send one and confirm it appears.)
9. **Other social surfaces.** Spot-check whatever exists in the nav: friends, pokes, taunts, relationships — confirm each page loads without a client-side error.
10. **Onboarding regression guard (the important one).** Register a BRAND-NEW credentials user: go to `/register`, fill a unique email + unique username + password + pick a valid school + class year, submit. After it logs you in, EXPECT to land DIRECTLY on `/feed`, **NOT** `/onboarding`. Screenshot the landing page. (This is the bug class that HTTP checks missed.)
11. **Auth0 button (partial).** Log out, go to `/login`, click "Continue with Auth0". EXPECT: redirected to `https://dev-afe77gumoeorof8u.us.auth0.com/...` Universal Login. Stop there (interactive Google sign-in can't be fully scripted) and record that the redirect works. Do NOT attempt to type real Google credentials.
12. **Console errors.** If the Playwright MCP exposes console/network, check for client-side exceptions on the pages you visited.

## Output
Produce a concise report: a table of each step with PASS / FAIL / SKIPPED + one line of evidence, the key screenshots, and any client-side errors or broken UI found. Call out anything that looks visually wrong even if it didn't error. End with an overall verdict and a short list of follow-ups.

Notes:
- Use unique values for the new-user registration each run (vary the email/username) so you don't collide with prior runs.
- This walkthrough does NOT push, deploy, or modify code — it only exercises the live UI.
- If the Playwright browser isn't available, tell the user to run `npx playwright install chromium` and to ensure the `playwright` MCP server is connected (restart Claude Code after adding `.mcp.json`).
