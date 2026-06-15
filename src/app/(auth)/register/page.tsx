"use client"

import { useFormState } from "react-dom"
import Link from "next/link"
import { register } from "./actions"

export default function RegisterPage() {
  const [state, formAction] = useFormState(register, {})

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-bold">Sign up</h1>

        {state.error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-600">{state.error}</p>
        )}

        <input
          name="username"
          placeholder="Username"
          required
          className="w-full rounded border border-gray-300 p-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border border-gray-300 p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (min 6 chars)"
          required
          minLength={6}
          className="w-full rounded border border-gray-300 p-2"
        />

        <button
          type="submit"
          className="w-full rounded bg-blue-600 p-2 font-medium text-white hover:bg-blue-700"
        >
          Create account
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  )
}
