import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Auth0 from "next-auth/providers/auth0"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
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
      // --- Auth0 sign-in: resolve (or provision) the matching users row. ---
      // The whole branch is wrapped so a DB hiccup or a constraint collision
      // degrades to "please retry" instead of a NextAuth error=Configuration
      // 500 that locks the user out of every Auth0 login.
      if (account?.provider === "auth0" && profile) {
        try {
          const prisma = getPrisma()
          const sub = profile.sub as string
          const email =
            (profile.email as string | undefined)?.trim().toLowerCase() ?? null
          const verified = profile.email_verified === true
          const select = { id: true, username: true, onboardedAt: true } as const

          // 1) Exact match on this Auth0 identity.
          let row = await prisma.user.findUnique({
            where: { auth0Sub: sub },
            select,
          })

          // 2) No row for this sub yet. With a VERIFIED email, resolve to the
          //    existing row that owns that (UNIQUE) email rather than trying to
          //    create a duplicate — a naive create would throw on the email
          //    constraint (the original bug). This both (a) adopts legacy
          //    credential rows (auth0Sub IS NULL) and (b) unifies a returning
          //    user who came back through a different Auth0 connection — Google
          //    vs the database connection mint different `sub`s for the same
          //    person. Unverified emails are NOT trusted: account-takeover guard.
          if (!row && verified && email) {
            const existing = await prisma.user.findUnique({
              where: { email },
              select: { ...select, auth0Sub: true },
            })
            if (existing) {
              if (existing.auth0Sub === null) {
                // Legacy/credential row — claim it for this Auth0 identity.
                row = await prisma.user.update({
                  where: { id: existing.id },
                  data: { auth0Sub: sub },
                  select,
                })
              } else {
                // Same verified email, already bound to another connection's
                // sub — same human; log into that row without rebinding it.
                row = {
                  id: existing.id,
                  username: existing.username,
                  onboardedAt: existing.onboardedAt,
                }
              }
            }
          }

          // 3) Brand-new user — create race-safely. Attach the email only if it
          //    is still free; otherwise store a synthetic address so the unique
          //    constraint can't bite. Onboarding collects the real profile.
          if (!row) {
            const emailFree =
              !!email &&
              !(await prisma.user.findUnique({
                where: { email },
                select: { id: true },
              }))
            try {
              row = await prisma.user.create({
                data: {
                  auth0Sub: sub,
                  email: emailFree ? (email as string) : `${sub}@auth0.local`,
                },
                select,
              })
            } catch (e) {
              // Lost the create race on auth0_sub — fetch the winner's row.
              if (
                e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === "P2002"
              ) {
                row = await prisma.user.findUnique({
                  where: { auth0Sub: sub },
                  select,
                })
              } else throw e
            }
          }

          if (row) {
            token.id = row.id
            token.name = row.username // DB username, not the OIDC display name
            token.onboarded = row.onboardedAt !== null
          }
        } catch (err) {
          console.error("Auth0 jwt provisioning failed:", err)
        }
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
