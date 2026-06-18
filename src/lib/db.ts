import { PrismaClient } from "@prisma/client"

// Single lazy PrismaClient for the whole app. Mirrors the old pg-Pool contract:
//   - The DATABASE_URL check + client construction happen lazily (on first use),
//     NOT at module import — a module-level throw breaks `next build`, which
//     imports route modules without a live DB (CLAUDE.md "Gotchas").
//   - Crash loud if DATABASE_URL is missing (CLAUDE.md "No process.env without
//     fallback validation").
// `new PrismaClient()` does not connect at construction (it connects on first
// query), so this stays build-safe as long as the generated client exists
// (prisma generate runs in postinstall, before tsc/next build).

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined
}

let client: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set — check Secret Manager binding on Cloud Run"
    )
  }
  if (!client) {
    // Reuse a cached instance across dev hot-reloads so we don't spawn a new
    // client (and pool) on every edit. In prod a single module instance is fine.
    client = globalThis.__prisma__ ?? new PrismaClient()
    if (process.env.NODE_ENV !== "production") globalThis.__prisma__ = client
  }
  return client
}

// Lazy proxy so call sites can `prisma.user.findMany()` etc. while the
// DATABASE_URL check + construction stay deferred to first property access.
// Importing this module during `next build` does nothing until first use.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
