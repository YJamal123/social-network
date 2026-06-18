"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { buttonClass, fieldClass } from "@/lib/ui"

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    })

    if (result?.error) {
      setError("Invalid email or password")
      setPending(false)
    } else {
      router.push("/feed")
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center text-masthead-logo text-primary">[ sml ]</div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border border-outline-variant bg-surface-container-lowest p-6 shadow-sm"
        >
          <h1 className="text-label-bold text-on-surface">Sign in to your network</h1>

          {error && (
            <p className="rounded bg-error-container p-2 text-body-sm text-error">
              {error}
            </p>
          )}

          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className={fieldClass}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className={fieldClass}
          />

          <button
            type="submit"
            disabled={pending}
            className={`${buttonClass.primary} w-full`}
          >
            {pending ? "Logging in…" : "Log in"}
          </button>

          <div className="flex items-center gap-2 text-body-sm text-outline">
            <span className="h-px flex-1 bg-outline-variant" />
            or
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          {/* Auth0 Universal Login (Google + the Auth0 Database connection).
              Sends the user to Auth0; the callback lands at
              /api/auth/callback/auth0 and NextAuth provisions the session. */}
          <button
            type="button"
            onClick={() => signIn("auth0", { callbackUrl: "/feed" })}
            className={`${buttonClass.outline} w-full`}
          >
            Continue with Auth0
          </button>

          <p className="text-center text-body-sm text-outline">
            No account?{" "}
            <Link href="/register" className="bracket-link text-primary hover:underline">
              create account
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
