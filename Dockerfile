FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
# prisma/ is needed at install time: package.json's postinstall runs
# `prisma generate`, which requires prisma/schema.prisma to exist.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `build` script runs `prisma generate && next build` (the generate is also a
# belt-and-suspenders against a stripped postinstall).
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Migrate image — runs `prisma migrate deploy` from inside the VPC as a one-shot
# Cloud Run Job. Needs the Prisma CLI (a dev dep), the schema engine, and the
# prisma/ dir (schema + migrations). It reuses the full node_modules from the
# `deps` stage (dev deps included) — the lean runner stage strips those.
FROM base AS migrate
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
# `npx prisma migrate deploy` applies any pending migrations and is idempotent.
CMD ["npx", "prisma", "migrate", "deploy"]

# Production image — minimal
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The standalone trace can drop Prisma's generated client + native engine binary.
# Copy them explicitly (belt-and-suspenders alongside outputFileTracingIncludes).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs

# Cloud Run injects PORT; Next.js standalone reads it automatically
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
