import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/db"

// TEMPORARY DEBUG ROUTE — token-guarded, READ-ONLY. Created by
// DBSTATE-INVESTIGATOR to inspect live user rows (onboardedAt / auth0Sub /
// username / hasPassword) while diagnosing the /onboarding "Continue does
// nothing" loop. The Implement phase MUST remove this file. It never returns
// passwordHash (only a boolean hasPassword).
//
// Contract:
//   GET /api/debug/users?token=<NEXTAUTH_SECRET>&email=<email>
//   GET /api/debug/users?token=<NEXTAUTH_SECRET>&onboardedNull=1
// Returns 401 if token !== process.env.NEXTAUTH_SECRET.

export const dynamic = "force-dynamic"

type DebugUser = {
  id: string
  email: string
  username: string | null
  hasPassword: boolean
  auth0Sub: string | null
  onboardedAt: string | null
  school: string | null
  classYear: number | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token")

  if (!process.env.NEXTAUTH_SECRET || token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const email = url.searchParams.get("email")?.trim().toLowerCase()
  const onboardedNull = url.searchParams.get("onboardedNull") === "1"

  const select = {
    id: true,
    email: true,
    username: true,
    passwordHash: true,
    auth0Sub: true,
    onboardedAt: true,
    school: true,
    classYear: true,
  } as const

  let rows
  if (onboardedNull) {
    rows = await getPrisma().user.findMany({
      where: { onboardedAt: null },
      select,
      orderBy: { createdAt: "asc" },
    })
  } else if (email) {
    rows = await getPrisma().user.findMany({
      where: { email },
      select,
      orderBy: { createdAt: "asc" },
    })
  } else {
    return NextResponse.json(
      { error: "Provide ?email=<email> or ?onboardedNull=1" },
      { status: 400 }
    )
  }

  const out: DebugUser[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    username: r.username,
    hasPassword: r.passwordHash !== null,
    auth0Sub: r.auth0Sub,
    onboardedAt: r.onboardedAt ? r.onboardedAt.toISOString() : null,
    school: r.school,
    classYear: r.classYear,
  }))

  return NextResponse.json({ count: out.length, users: out })
}
