import type { NextAuthConfig } from "next-auth"

// Edge-safe config shared by middleware and the full Node auth.
// MUST NOT import pg, bcrypt, or anything Node-only — middleware runs on the edge.
export const authConfig = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const onboarded = auth?.user?.onboarded === true
      const path = nextUrl.pathname
      const isAuthPage =
        path.startsWith("/login") || path.startsWith("/register")
      const isOnboarding = path.startsWith("/onboarding")

      // Auth pages: bounce logged-in users into the app (or onboarding if their
      // profile is incomplete); let logged-out users see the page.
      if (isAuthPage) {
        if (isLoggedIn)
          return Response.redirect(
            new URL(onboarded ? "/feed" : "/onboarding", nextUrl)
          )
        return true
      }

      // Everything else is protected.
      if (!isLoggedIn) return false // → redirect to pages.signIn ("/login")

      // Force not-yet-onboarded users through /onboarding; once onboarded,
      // keep them out of it. `onboarded` rides on the JWT (token.onboarded set
      // by the Node jwt callback in auth.ts), so this stays DB-free / edge-safe.
      if (!onboarded && !isOnboarding)
        return Response.redirect(new URL("/onboarding", nextUrl))
      if (onboarded && isOnboarding)
        return Response.redirect(new URL("/feed", nextUrl))

      return true
    },
    // Thin edge jwt: the credentials provider's authorize() returns
    // { id, name, email } and NextAuth defaults persist name onto the token.
    // The Node jwt callback in auth.ts overrides this for Auth0 (upsert +
    // token.name = DB username + token.onboarded). Keep this DB-free.
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      // token.name is normally copied to session.user.name by NextAuth's
      // defaults, but copy explicitly so it stays the DB username (not the
      // OIDC display name) under the Auth0 provider.
      if (typeof token.name === "string" || token.name === null)
        session.user.name = token.name
      session.user.onboarded = token.onboarded === true
      return session
    },
  },
} satisfies NextAuthConfig
