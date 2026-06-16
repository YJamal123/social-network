"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { buttonClass } from "@/lib/ui"

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
            className="w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />

          <button
            type="submit"
            disabled={pending}
            className={`${buttonClass.primary} w-full`}
          >
            {pending ? "Logging in…" : "Log in"}
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
