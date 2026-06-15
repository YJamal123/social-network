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
      const isAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register")

      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/feed", nextUrl))
        return true
      }
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
} satisfies NextAuthConfig
