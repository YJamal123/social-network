# GCP Secret Manager + Cloud Run Integration

## This Project's Secrets

| Secret name | What it holds |
|---|---|
| `mdjamal-db-url` | Full PostgreSQL connection string (unix socket format for Cloud Run) |
| `mdjamal-nextauth-secret` | 32-byte random string for NextAuth JWT signing |

## Creating Secrets

```bash
# From a value
echo -n "my-secret-value" | gcloud secrets create my-secret \
  --project=sml-interview-sandbox \
  --data-file=-

# From a file
gcloud secrets create my-secret \
  --project=sml-interview-sandbox \
  --data-file=./secret.txt

# Generate and store NextAuth secret in one command
openssl rand -base64 32 | gcloud secrets create mdjamal-nextauth-secret \
  --project=sml-interview-sandbox \
  --data-file=-
```

## Storing the Database URL

The DATABASE_URL uses the Cloud SQL unix socket format. Create it after the Cloud SQL instance and DB user are ready:

```bash
DB_PASS="<your-db-password>"
DB_USER="app_user"
DB_NAME="social_network"
INSTANCE_CONNECTION="sml-interview-sandbox:us-central1:mdjamal-db"

echo -n "postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION}" \
  | gcloud secrets create mdjamal-db-url \
    --project=sml-interview-sandbox \
    --data-file=-
```

## Updating a Secret (new version)

```bash
echo -n "new-value" | gcloud secrets versions add mdjamal-db-url \
  --project=sml-interview-sandbox \
  --data-file=-

# Cloud Run uses :latest — it picks up the new version on next cold start or redeploy
```

## Wiring Secrets into Cloud Run

Secrets are mounted as environment variables at deploy time:

```bash
gcloud run deploy mdjamal-app \
  --set-secrets=DATABASE_URL=mdjamal-db-url:latest,NEXTAUTH_SECRET=mdjamal-nextauth-secret:latest \
  ...
```

Inside the container, they're just `process.env.DATABASE_URL` and `process.env.NEXTAUTH_SECRET` — no SDK needed to read them.

## IAM: Grant Cloud Run Access to Secrets

Cloud Run uses the **Compute Engine default service account** by default:
`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`

```bash
PROJECT_NUMBER=$(gcloud projects describe sml-interview-sandbox --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Allow Cloud Run to read secrets
gcloud projects add-iam-policy-binding sml-interview-sandbox \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor"

# Allow Cloud Run to connect to Cloud SQL
gcloud projects add-iam-policy-binding sml-interview-sandbox \
  --member="serviceAccount:${SA}" \
  --role="roles/cloudsql.client"
```

These are already set for this project (done in Phase 0).

## Reading Secrets in Code

No SDK needed — Cloud Run injects them as env vars. Just read `process.env`:

```ts
// src/lib/db.ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — check Secret Manager binding on Cloud Run")
}
```

```ts
// NextAuth reads NEXTAUTH_SECRET automatically from process.env
// Just make sure it's wired via --set-secrets
```

## Cloud SQL + Private IP: How the Connection Works

```
Cloud Run container
  └─ --add-cloudsql-instances=sml-interview-sandbox:us-central1:mdjamal-db
       └─ Cloud SQL Auth Proxy sidecar mounts unix socket:
            /cloudsql/sml-interview-sandbox:us-central1:mdjamal-db

DATABASE_URL=postgresql://app_user:pass@/social_network
             ?host=/cloudsql/sml-interview-sandbox:us-central1:mdjamal-db
                    ↑ pg connects here — no TCP, no public IP needed
```

The Auth Proxy handles TLS and IAM auth to Cloud SQL. Your app just opens the unix socket.

Cloud Run also needs `--network=default --vpc-egress=private-ranges-only` because our instance has no public IP — traffic goes over the VPC to the private IP.

## Verifying Secrets Work

```bash
# Check a secret exists and has versions
gcloud secrets versions list mdjamal-db-url --project=sml-interview-sandbox

# Read the current value (be careful — this prints the secret)
gcloud secrets versions access latest --secret=mdjamal-db-url --project=sml-interview-sandbox

# Check Cloud Run service has the secret mounted
gcloud run services describe mdjamal-app \
  --region=us-central1 \
  --project=sml-interview-sandbox \
  --format="yaml(spec.template.spec.containers[0].env)"
```

## Local Development

Secrets don't exist locally. Use a `.env.local` file (gitignored):

```bash
# .env.local  — NEVER COMMIT
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/social_network
NEXTAUTH_SECRET=any-random-string-for-local-dev
NEXTAUTH_URL=http://localhost:3000
```

For local → Cloud SQL, run the Auth Proxy:

```bash
# Download: https://cloud.google.com/sql/docs/postgres/sql-proxy
./cloud-sql-proxy sml-interview-sandbox:us-central1:mdjamal-db --port=5432
# Then DATABASE_URL=postgresql://app_user:pass@localhost:5432/social_network
```

## Gotchas

- **`:latest` in `--set-secrets`** means the newest version at deploy time. Updating a secret doesn't hot-reload running containers — redeploy or wait for a new instance cold start.
- **`echo -n`** — the `-n` is critical. Without it, `echo` appends a newline and the connection string breaks.
- **Secret names are immutable** — you can't rename a secret, only add new versions or delete and recreate.
- **Never log `process.env.DATABASE_URL`** — it contains the DB password.
- **The repo is public** — `.gitignore` already blocks `.env*`. Never hardcode credentials, even in comments.
