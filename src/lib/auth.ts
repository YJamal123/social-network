import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Auth0 from "next-auth/providers/auth0"
import bcrypt from "bcryptjs"
import { getPrisma } from "@/lib/db"
import { authConfig } from "@/lib/auth.config"

// Node-side NextAuth: the full provider set + the DB-touching jwt callback.
// This module is imported ONLY from Node contexts (route handlers, server
// `auth()` calls) — never from middleware (which imports auth.config.ts).
// It spreads authConfig (inheriting the edge-safe authorized/session callbacks)
// and overrides only `jwt` so the edge instance never references the DB jwt.

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    // Auth0 OIDC (Google + the Auth0 Database connection live behind Universal
    // Login). Explicit env reads for self-documentation. AUTH0_ISSUER is the
    // full https://<tenant>.<region>.auth0.com URL.
    Auth0({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER,
    }),
    // Credentials fallback (transition release): the existing bcrypt login.
    // Both providers resolve to the SAME users.id session identity.
    Credentials({
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase()
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await getPrisma().user.findUnique({ where: { email } })
        // Auth0-only rows have no passwordHash — they can't use this path.
        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        // `onboarded` is surfaced on the returned user so the jwt callback can
        // stamp token.onboarded for the credentials path without a DB re-read.
        return {
          id: user.id,
          name: user.username,
          email: user.email,
          onboarded: user.onboardedAt !== null,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Node-only jwt: runs on first sign-in (account/profile present for Auth0,
    // or `user` present for credentials) and on session.update() triggers.
    // Enriches the token with our DB identity. Overrides the thin edge jwt.
    async jwt({ token, account, profile, user, trigger }) {
      // --- Auth0 first sign-in: provision-on-first-login (race-safe). ---
      if (account?.provider === "auth0" && profile) {
        const prisma = getPrisma()
        const sub = profile.sub as string
        const email =
          (profile.email as string | undefined)?.trim().toLowerCase() ?? null
        const verified = profile.email_verified === true

        // 1) Race-safe insert-or-fetch keyed on auth0_sub (unique). A concurrent
        //    first request hits the unique constraint and the update branch
        //    no-ops, so we always end up with exactly one row.
        let row = await prisma.user.upsert({
          where: { auth0Sub: sub },
          create: { auth0Sub: sub, email: email ?? `${sub}@auth0.local` },
          update: {},
          select: { id: true, username: true, onboardedAt: true },
        })

        // 2) Link-by-email adoption — ONLY for verified emails, ONLY when this
        //    is a brand-new placeholder row (no username, not onboarded) and a
        //    legacy row with the same email exists without an auth0_sub.
        //    Gating on email_verified blocks the account-takeover vector.
        if (
          verified &&
          email &&
          row.username === null &&
          row.onboardedAt === null
        ) {
          const legacy = await prisma.user.findFirst({
            where: { email, auth0Sub: null },
            select: { id: true, username: true, onboardedAt: true },
          })
          if (legacy) {
            const adopted = await prisma.user.update({
              where: { id: legacy.id },
              data: { auth0Sub: sub },
              select: { id: true, username: true, onboardedAt: true },
            })
            // Drop the just-created placeholder, keep the legacy row + its data.
            await prisma.user.deleteMany({
              where: { id: row.id, username: null },
            })
            row = adopted
          }
        }

        token.id = row.id
        token.name = row.username // OVERWRITE OIDC name with our DB username
        token.onboarded = row.onboardedAt !== null
        return token
      }

      // --- Credentials first sign-in. ---
      if (user) {
        token.id = user.id
        token.name = user.name
        token.onboarded = (user as { onboarded?: boolean }).onboarded === true
        return token
      }

      // --- Mid-session refresh (e.g. after onboarding completes). Re-read the
      //     onboarding state so the stale token.onboarded doesn't loop the user
      //     back to /onboarding. Triggered by the client's useSession().update().
      if (trigger === "update" && token.id) {
        const fresh = await getPrisma().user.findUnique({
          where: { id: token.id as string },
          select: { username: true, onboardedAt: true },
        })
        if (fresh) {
          token.name = fresh.username
          token.onboarded = fresh.onboardedAt !== null
        }
      }

      return token
    },
  },
})
