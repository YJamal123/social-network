# Dockerfile for Cloud Run (Node 20, Next.js Standalone)

## The Dockerfile (already at project root)

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

## Required: `output: "standalone"` in `next.config.mjs`

```js
const nextConfig = {
  output: "standalone",  // produces .next/standalone/server.js
}
export default nextConfig
```

Without this the build won't produce `server.js` and the container will fail to start.

## Build + Push to Artifact Registry

```bash
# Configure Docker to use gcloud credentials
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build (run from project root)
IMAGE=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app

docker build -t $IMAGE:v1 .
docker push $IMAGE:v1
```

## Deploy to Cloud Run

```bash
IMAGE=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app

gcloud run deploy mdjamal-app \
  --image=$IMAGE:v1 \
  --platform=managed \
  --region=us-central1 \
  --project=sml-interview-sandbox \
  --allow-unauthenticated \
  --port=8080 \
  --set-secrets=DATABASE_URL=mdjamal-db-url:latest,NEXTAUTH_SECRET=mdjamal-nextauth-secret:latest \
  --set-env-vars=NEXTAUTH_URL=https://PLACEHOLDER_REPLACE_AFTER_FIRST_DEPLOY \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only \
  --add-cloudsql-instances=sml-interview-sandbox:us-central1:mdjamal-db \
  --max-instances=3 \
  --memory=512Mi
```

**First deploy:** omit `--set-env-vars=NEXTAUTH_URL=...`, get the URL from the output, then update:

```bash
gcloud run services update mdjamal-app \
  --region=us-central1 \
  --project=sml-interview-sandbox \
  --set-env-vars=NEXTAUTH_URL=https://<YOUR_CLOUD_RUN_URL>
```

## Private IP + VPC Egress (this project's setup)

Our Cloud SQL instance has **no public IP** (org policy blocks it). Cloud Run connects via private IP using Direct VPC Egress:

- `--network=default --subnet=default` — puts Cloud Run on the default VPC
- `--vpc-egress=private-ranges-only` — routes RFC-1918 traffic through VPC (Cloud SQL private IP is in this range)
- `--add-cloudsql-instances=...` — mounts the Cloud SQL Auth Proxy unix socket at `/cloudsql/<instance>`

The `DATABASE_URL` must use the unix socket host:
```
postgresql://app_user:password@/social_network?host=/cloudsql/sml-interview-sandbox:us-central1:mdjamal-db
```

## Iterating (redeploy after code changes)

```bash
IMAGE=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app

# Bump the tag each redeploy so Cloud Run definitely pulls the new image
docker build -t $IMAGE:v2 . && docker push $IMAGE:v2

gcloud run deploy mdjamal-app \
  --image=$IMAGE:v2 \
  --region=us-central1 \
  --project=sml-interview-sandbox
```

## Gotchas

- **`HOSTNAME="0.0.0.0"` is required** — without it Next.js standalone only binds to `127.0.0.1` and Cloud Run health checks fail.
- **`PORT=8080` must match `EXPOSE 8080`** — Cloud Run expects port 8080 by default (`--port=8080`).
- **Multi-stage build is essential** — shipping `node_modules` from the builder stage balloons the image to 1GB+. The standalone runner stage is ~150MB.
- **`libc6-compat` on alpine** — required for some native bindings (bcrypt, pg has none, but safe to include).
- **Don't copy `.env.local`** — it gets baked into the image. Cloud Run env vars come from `--set-secrets` and `--set-env-vars` at deploy time.
- **`npm ci` not `npm install`** — reproducible builds from `package-lock.json`.
- **Tag images with a version** (`v1`, `v2`, ...) — Cloud Run can cache `latest` and not pull the new image.
