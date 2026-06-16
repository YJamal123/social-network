"use client"

import { useFormState } from "react-dom"
import Link from "next/link"
import { register } from "./actions"

export default function RegisterPage() {
  const [state, formAction] = useFormState(register, {})

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center text-masthead-logo text-primary">[ sml ]</div>
        <form
          action={formAction}
          className="space-y-4 border border-outline-variant bg-surface-container-lowest p-6 shadow-sm"
        >
          <h1 className="text-label-bold text-on-surface">Join the network</h1>

          {state.error && (
            <p className="rounded bg-error-container p-2 text-body-sm text-error">
              {state.error}
            </p>
          )}

          <input
            name="username"
            placeholder="Username"
            required
            className="w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />
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
            placeholder="Password (min 6 chars)"
            required
            minLength={6}
            className="w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
          />

          <button
            type="submit"
            className="w-full rounded bg-primary p-2 text-label-bold text-on-primary transition-opacity hover:opacity-90"
          >
            Create account
          </button>

          <p className="text-center text-body-sm text-outline">
            Already have an account?{" "}
            <Link href="/login" className="bracket-link text-primary hover:underline">
              log in
            </Link>
          </p>
        </form>
      </div>
    </main>
  )
}
