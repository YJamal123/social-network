"use client"

import { SessionProvider } from "next-auth/react"

// Scope the SessionProvider to /onboarding only: the onboarding form needs
// useSession().update() to refresh token.onboarded after submit. The rest of
// the app reads the session server-side (await auth()) and uses the standalone
// signIn/signOut helpers, so it needs no provider — keeping this local avoids
// touching the global layout and the live login path.
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
