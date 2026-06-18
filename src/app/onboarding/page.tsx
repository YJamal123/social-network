"use client"

import { useEffect } from "react"
import { useFormState } from "react-dom"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { onboard } from "./actions"
import { buttonClass, fieldClass } from "@/lib/ui"
import { SCHOOLS } from "@/lib/schools"
import { CLASS_YEARS } from "@/lib/classYears"

export default function OnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const [state, formAction] = useFormState(onboard, {})

  // On success: refresh the JWT (flips token.onboarded → true via the Node jwt
  // "update" branch) BEFORE navigating, so the authorized callback lets us into
  // /feed instead of looping back to /onboarding.
  useEffect(() => {
    if (state.ok) {
      void update().then(() => router.push("/feed"))
    }
  }, [state.ok, update, router])

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center text-masthead-logo text-primary">[ sml ]</div>
        <form
          action={formAction}
          className="space-y-4 border border-outline-variant bg-surface-container-lowest p-6 shadow-sm"
        >
          <h1 className="text-label-bold text-on-surface">Finish your profile</h1>
          <p className="text-body-sm text-outline">
            Pick a username and tell us your school to join the network.
          </p>

          {state.error && (
            <p className="rounded bg-error-container p-2 text-body-sm text-error">
              {state.error}
            </p>
          )}

          <input
            name="username"
            placeholder="Username"
            required
            className={fieldClass}
          />
          <select name="school" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Select your school
            </option>
            {SCHOOLS.map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </select>
          <select name="class_year" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Select your class year
            </option>
            {CLASS_YEARS.map((year) => (
              <option key={year} value={year}>
                Class of {year}
              </option>
            ))}
          </select>

          <button type="submit" className={`${buttonClass.primary} w-full`}>
            Continue
          </button>
        </form>
      </div>
    </main>
  )
}
