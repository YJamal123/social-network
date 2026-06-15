# SML Social Network

A minimal social network built with Next.js 14 (App Router), deployed on Google Cloud Run with Cloud SQL (PostgreSQL).

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `DATABASE_URL` and `NEXTAUTH_SECRET` in a local `.env.local` file (never commit this).

## Deploy to Cloud Run

```bash
# Build and push image to Artifact Registry
docker build -t us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 .
docker push us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1

# Deploy
gcloud run deploy mdjamal-app \
  --image=us-central1-docker.pkg.dev/sml-interview-sandbox/mdjamal-registry/mdjamal-app:v1 \
  --platform=managed \
  --region=us-central1 \
  --project=sml-interview-sandbox \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=mdjamal-db-url:latest,NEXTAUTH_SECRET=mdjamal-nextauth-secret:latest \
  --add-cloudsql-instances=sml-interview-sandbox:us-central1:mdjamal-db
```

See [plan.md](plan.md) for the full phased build plan and deployment cheat sheet.

## Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Cloud SQL — PostgreSQL 15
- **Compute:** Cloud Run
- **Secrets:** Secret Manager
- **GCP project:** `sml-interview-sandbox` / region `us-central1`
