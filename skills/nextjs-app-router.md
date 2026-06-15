# Next.js 14 App Router Patterns

## Route Groups (no URL impact)

```
src/app/
  (auth)/          ← unauthenticated pages
    login/page.tsx
    register/page.tsx
  (main)/          ← protected pages
    feed/page.tsx
    profile/[username]/page.tsx
  layout.tsx       ← root layout (html/body)
  page.tsx         ← redirect to /feed
```

## Server Components (default) vs Client Components

```tsx
// Server Component — runs on server, can be async, can query DB directly
// NO useState, NO useEffect, NO event handlers
export default async function FeedPage() {
  const posts = await getPosts() // direct DB call, fine here
  return <div>{posts.map(p => <PostCard key={p.id} post={p} />)}</div>
}

// Client Component — add "use client" at top
"use client"
import { useState } from "react"
export function PostForm() {
  const [content, setContent] = useState("")
  // ...
}
```

**Rule of thumb:** Keep components Server by default. Only drop to Client when you need interactivity (onClick, useState, useEffect).

## Server Actions (mutations)

```tsx
// src/app/(main)/feed/actions.ts
"use server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"

export async function createPost(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthenticated")

  const content = formData.get("content") as string
  if (!content || content.length > 280) throw new Error("Invalid content")

  await query(
    "INSERT INTO posts (user_id, content) VALUES ($1, $2)",
    [session.user.id, content]
  )
  revalidatePath("/feed")
}
```

```tsx
// Wire into a Client Component form
"use client"
import { createPost } from "./actions"

export function PostForm() {
  return (
    <form action={createPost}>
      <textarea name="content" maxLength={280} required />
      <button type="submit">Post</button>
    </form>
  )
}
```

## Route Handlers (read APIs)

```ts
// src/app/api/posts/route.ts
import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET() {
  try {
    const result = await query(
      `SELECT p.*, u.username FROM posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    )
    return NextResponse.json(result.rows)
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 })
  }
}
```

## Dynamic Routes

```tsx
// src/app/(main)/profile/[username]/page.tsx
export default async function ProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const { username } = params
  // ...
}
```

## Middleware (protect routes)

```ts
// src/middleware.ts
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
                     req.nextUrl.pathname.startsWith("/register")

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/feed", req.url))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

## Root Layout

```tsx
// src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SML Social",
  description: "Minimal social network",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
```

## Gotchas

- **`async` params in dynamic routes:** In Next.js 14, `params` is synchronous. In Next.js 15 it becomes a Promise — don't await it here.
- **`revalidatePath` after mutations:** Always call after DB writes or the page won't show fresh data.
- **Never import server-only code in Client Components.** `db.ts`, `auth.ts` cannot be imported in a `"use client"` file.
- **`output: "standalone"` in `next.config.mjs`** is required for the Dockerfile — without it there's no `server.js` to run.
- **Don't use `redirect()` inside try/catch** — Next.js `redirect()` throws internally and the catch block swallows it.
