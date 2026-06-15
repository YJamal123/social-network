# NextAuth.js v5 — Credentials Provider

## Install

```bash
npm install next-auth@beta
```

> v5 (beta) is the version that works with Next.js 14 App Router natively. The import paths changed from v4.

## Auth Config (`src/lib/auth.ts`)

```ts
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { query } from "@/lib/db"
import type { User } from "@/lib/types"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const result = await query<User>(
          "SELECT * FROM users WHERE email = $1",
          [credentials.email]
        )
        const user = result.rows[0]
        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        )
        if (!valid) return null

        return { id: user.id, name: user.username, email: user.email }
      },
    }),
  ],
  callbacks: {
    // Persist user.id onto the session — needed for DB writes
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",   // auth errors redirect here with ?error=...
  },
  session: { strategy: "jwt" },
})
```

## Route Handler (`src/app/api/auth/[...nextauth]/route.ts`)

```ts
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

## TypeScript: Extend Session Type

```ts
// src/lib/types.ts  (or a separate next-auth.d.ts)
import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
    }
  }
}
```

## Reading the Session

```ts
// Server Component or Server Action
import { auth } from "@/lib/auth"

const session = await auth()
if (!session?.user?.id) {
  // not logged in
}
const userId = session.user.id
```

```tsx
// Client Component
"use client"
import { useSession } from "next-auth/react"

export function NavBar() {
  const { data: session } = useSession()
  return <span>{session?.user?.name}</span>
}
```

## SessionProvider (wrap root layout if using useSession)

```tsx
// src/app/layout.tsx
import { SessionProvider } from "next-auth/react"
import { auth } from "@/lib/auth"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  )
}
```

## Login Form (Client Component)

```tsx
"use client"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    })
    if (result?.error) {
      setError("Invalid email or password")
    } else {
      router.push("/feed")
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="text-red-500">{error}</p>}
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Log in</button>
    </form>
  )
}
```

## Sign Out

```tsx
"use client"
import { signOut } from "next-auth/react"

<button onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
```

## Register Flow (not NextAuth — just a Server Action)

```ts
// src/app/(auth)/register/actions.ts
"use server"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { query } from "@/lib/db"

export async function register(formData: FormData) {
  const username = formData.get("username") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
      [username, email, passwordHash]
    )
  } catch (err: any) {
    if (err.code === "23505") {
      // unique_violation
      throw new Error("Username or email already taken")
    }
    throw err
  }

  redirect("/login")
}
```

## Required Environment Variables

```
NEXTAUTH_SECRET=<32-byte random string>    # from Secret Manager: mdjamal-nextauth-secret
NEXTAUTH_URL=https://<cloud-run-url>       # full public URL, set as Cloud Run env var
```

## Gotchas

- **v5 import paths differ from v4:** `import NextAuth from "next-auth"` (not `"next-auth/next"`). Providers come from `"next-auth/providers/..."`.
- **`session.user.id` isn't in the default type** — you must extend the `Session` interface (see TypeScript section above).
- **`authorize()` must return `null` on failure**, not throw — throwing causes a 500, not a graceful auth error.
- **`redirect: false` in `signIn()`** lets you handle the error in the UI instead of a hard redirect to the error page.
- **`NEXTAUTH_URL` must match the Cloud Run public URL exactly** — mismatches cause redirect errors after login.
- **JWT strategy** means no DB adapter needed for sessions — simpler for this project.
