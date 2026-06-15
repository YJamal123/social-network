"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"

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
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Log in</h1>

        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
        )}

        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border border-gray-300 bg-white p-2 text-gray-900 placeholder-gray-500"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="w-full rounded border border-gray-300 bg-white p-2 text-gray-900 placeholder-gray-500"
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-blue-600 p-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-gray-500">
          No account?{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  )
}
