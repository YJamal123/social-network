-- Auth0 transition columns (additive, non-destructive).
--
-- Adds the OIDC join key `auth0_sub` (stable Auth0 `sub`) and `onboarded_at`
-- (gates the one-time /onboarding step), and relaxes NOT NULL on `username` /
-- `password_hash` so an Auth0-provisioned row can exist before onboarding and
-- without a bcrypt hash. The credentials path keeps writing both, so existing
-- rows are unaffected.
--
-- The UNIQUE index on `auth0_sub` lets Postgres treat the many pre-existing
-- NULLs (legacy/credentials rows) as distinct while guaranteeing one row per
-- Auth0 identity — this is the conflict target for the race-safe first-login
-- upsert in src/lib/auth.ts (`prisma.user.upsert({ where: { auth0Sub } })`).
--
-- Generated offline (no shadow DB) via:
--   prisma migrate diff --from-schema-datamodel <pre-auth0 schema>
--                       --to-schema-datamodel prisma/schema.prisma --script
-- `0_init` is baselined in prod, so `prisma migrate deploy` applies ONLY this.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth0_sub" TEXT,
ADD COLUMN     "onboarded_at" TIMESTAMPTZ(6),
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0_sub_key" ON "users"("auth0_sub");
