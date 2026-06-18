"use server"

import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
import { isValidSchool } from "@/lib/schools"
import { isValidClassYear } from "@/lib/classYears"

export type OnboardingState = { error?: string; ok?: boolean }

// One-time onboarding for Auth0 users who have no username/school/class_year.
// Mutation contract: returns { error?: string }, never throws. On success it
// returns { ok: true } (NOT a server redirect) so the client can refresh the
// JWT via useSession().update() before navigating — otherwise the stale
// token.onboarded=false would bounce the user straight back here.
export async function onboard(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }
  if (session.user.onboarded) {
    // Already onboarded — nothing to do; let the client move on.
    return { ok: true }
  }

  const username = (formData.get("username") as string)?.trim()
  const school = (formData.get("school") as string)?.trim()
  const classYearRaw = (formData.get("class_year") as string)?.trim()

  if (!username || !school || !classYearRaw) {
    return { error: "All fields are required" }
  }
  if (!isValidSchool(school)) {
    return { error: "Please choose a valid school" }
  }
  const classYear = Number(classYearRaw)
  if (!isValidClassYear(classYear)) {
    return { error: "Please choose a valid class year" }
  }

  try {
    // Guard on onboardedAt IS NULL so a double-submit can't re-onboard. If the
    // row was already onboarded (count 0), treat as success.
    await getPrisma().user.updateMany({
      where: { id: session.user.id, onboardedAt: null },
      data: {
        username,
        school,
        classYear,
        onboardedAt: new Date(),
      },
    })
  } catch (err) {
    // P2002 = unique constraint violation (username already taken), the Prisma
    // equivalent of pg 23505. Mirrors register/actions.ts.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { error: "Username already taken" }
    }
    console.error("Onboarding failed:", err)
    return { error: "Something went wrong" }
  }

  return { ok: true }
}
