# Build Plan — SML Social Network

**Target:** Live Cloud Run URL within 60 min. Core features done by 90 min. Stretch goals in the remaining 30 min.

**Clock starts on first git commit.**

---

## Phase 0 — Infra Setup (0–10 min)

Goal: Cloud SQL instance running, Artifact Registry repo created, secrets staged.

**Tasks (run in parallel where possible):**
- [ ] Create Cloud SQL instance: `gcloud sql instances create mdjamal-db --database-version=POSTGRES_15 --tier=db-f1-micro --region=us-central1 --project=sml-interview-sandbox`
- [ ] Create database and user on instance
- [ ] Create Artifact Registry repo: `gcloud artifacts repositories create mdjamal-registry --repository-format=docker --location=us-central1`
- [ ] Store DB URL in Secret Manager: `gcloud secrets create mdjamal-db-url --data-file=-`
- [ ] Store NextAuth secret: `openssl rand -base64 32 | gcloud secrets create mdjamal-nextauth-secret --data-file=-`
- [ ] Enable required APIs: Cloud Run, Cloud SQL, Artifact Registry, Secret Manager

**Done when:** `gcloud sql instances describe mdjamal-db` shows `RUNNABLE`.

---

## Phase 1 — DB Schema + Connection (10–20 min)

Goal: App can query Cloud SQL. Schema applied.

**Tasks:**
- [ ] Add `pg` and `bcryptjs` and `next-auth` packages: `npm install pg bcryptjs next-auth@beta`
- [ ] Add types: `npm install -D @types/pg @types/bcryptjs`
- [ ] Write `src/lib/db.ts` — Pool singleton reading `DATABASE_URL`
- [ ] Write `schema.sql` and apply it via Cloud SQL Auth Proxy or `psql`
- [ ] Write `src/lib/types.ts` — `User`, `Post` interfaces
- [ ] Smoke test: add a test Route Handler `GET /api/health` that runs `SELECT 1` and returns `{ ok: true }`

**Done when:** `/api/health` returns `200 { ok: true }` locally.

---

## Phase 2 — Auth (Register + Login) (20–35 min)

Goal: Users can sign up and log in. Session established.

**Tasks:**
- [ ] Configure NextAuth in `src/lib/auth.ts` — credentials provider, DB session adapter
- [ ] Add `src/app/api/auth/[...nextauth]/route.ts`
- [ ] Write `src/app/(auth)/register/page.tsx` — form with username, email, password
- [ ] Write `POST /api/users` Route Handler — hash password with bcrypt, insert user
- [ ] Write `src/app/(auth)/login/page.tsx` — NextAuth `signIn()` call
- [ ] Write `src/middleware.ts` — redirect unauthenticated users from `(main)` routes to `/login`

**Done when:** Can register a new account, log in, and be redirected to `/feed`.

---

## Phase 3 — Post Creation (35–45 min)

Goal: Logged-in users can write and submit status updates.

**Tasks:**
- [ ] Write `src/components/PostForm.tsx` — textarea (≤280 chars) + submit button
- [ ] Write Server Action `createPost` in `src/app/(main)/feed/actions.ts` — insert into `posts`, revalidate path
- [ ] Wire `PostForm` into the feed page using the Server Action

**Done when:** Submitting the form inserts a row in `posts` and the form clears.

---

## Phase 4 — Feed (45–60 min) ← FIRST LIVE DEPLOY TARGET

Goal: Feed displays posts. App is live on Cloud Run.

**Tasks:**
- [ ] Write `src/app/(main)/feed/page.tsx` — Server Component, queries `posts JOIN users ORDER BY created_at DESC LIMIT 50`
- [ ] Write `src/components/PostCard.tsx` — shows avatar initials, username, timestamp, content
- [ ] Build Docker image and push to Artifact Registry: `docker build -t us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 . && docker push ...`
- [ ] Deploy to Cloud Run: `gcloud run deploy mdjamal-app --image=... --platform=managed --region=us-central1 --allow-unauthenticated --set-secrets=DATABASE_URL=mdjamal-db-url:latest,NEXTAUTH_SECRET=mdjamal-nextauth-secret:latest --add-cloudsql-instances=sml-interview-sandbox:us-central1:mdjamal-db`
- [ ] Set `NEXTAUTH_URL` env var to the Cloud Run HTTPS URL
- [ ] Verify: register → post → see post in feed on public URL

**Done when:** Public HTTPS Cloud Run URL shows a working feed. ✓

---

## Phase 5 — User Profiles (60–75 min)

Goal: Each user has a profile page at `/profile/[username]`.

**Tasks:**
- [ ] Write `src/app/(main)/profile/[username]/page.tsx` — Server Component: fetch user by username, list their posts
- [ ] Add nav link to current user's profile in layout
- [ ] Write `src/app/(main)/profile/[username]/edit/page.tsx` (if time) — update bio, username
- [ ] Redeploy

**Done when:** `/profile/alice` shows Alice's posts and bio.

---

## Phase 6 — Stretch Goals (75–120 min, time permitting)

Implement in this priority order; skip if time is short.

### 6a — Follows
- [ ] Apply `follows` table migration
- [ ] `POST /api/follows` — follow/unfollow toggle
- [ ] Filter feed to followed users + self (fall back to all if following nobody)
- [ ] Show follow button on profile pages

### 6b — Likes
- [ ] Apply `likes` table migration
- [ ] Server Action `toggleLike` — upsert/delete in `likes`
- [ ] Show like count + filled/outline heart on `PostCard`

### 6c — Comments
- [ ] Add `comments` table: `id, post_id, user_id, content, created_at`
- [ ] `POST /api/posts/[id]/comments`
- [ ] Expand `PostCard` to show comment count; clicking opens inline comment thread

---

## Deployment Cheat Sheet

```bash
# Build + push image
docker build -t us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 .
docker push us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1

# Deploy (first time)
gcloud run deploy mdjamal-app \
  --image=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 \
  --platform=managed \
  --region=us-central1 \
  --project=sml-interview-sandbox \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=mdjamal-db-url:latest,NEXTAUTH_SECRET=mdjamal-nextauth-secret:latest \
  --set-env-vars=NEXTAUTH_URL=https://<YOUR_CLOUD_RUN_URL> \
  --add-cloudsql-instances=sml-interview-sandbox:us-central1:mdjamal-db

# Redeploy (update image tag each time)
gcloud run deploy mdjamal-app \
  --image=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 \
  --region=us-central1 --project=sml-interview-sandbox
```

---

## Time Budget Summary

| Phase | Window | Milestone |
|---|---|---|
| 0 — Infra | 0–10 min | Cloud SQL + secrets ready |
| 1 — Schema + DB | 10–20 min | `/api/health` returns 200 |
| 2 — Auth | 20–35 min | Register + login working |
| 3 — Post creation | 35–45 min | Can write a post |
| 4 — Feed + **Deploy** | 45–60 min | **Live Cloud Run URL** |
| 5 — Profiles | 60–75 min | `/profile/[username]` works |
| 6a — Follows | 75–90 min | Feed filters to followed users |
| 6b — Likes | 90–105 min | Like count on posts |
| 6c — Comments | 105–120 min | Inline comment thread |
