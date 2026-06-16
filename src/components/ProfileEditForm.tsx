"use client"

import { useFormState } from "react-dom"
import Link from "next/link"
import { updateProfile } from "@/app/(main)/profile/actions"

const MAX_BIO = 280

export function ProfileEditForm({
  username,
  initialBio,
}: {
  username: string
  initialBio: string
}) {
  const [state, formAction] = useFormState(updateProfile, {})

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-2xl font-bold">Edit profile</h1>

      {state.error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">{state.error}</p>
      )}

      <label className="block text-sm font-medium text-gray-700">
        Bio
        <textarea
          name="bio"
          defaultValue={initialBio}
          maxLength={MAX_BIO}
          rows={4}
          placeholder="Tell people about yourself"
          className="mt-1 w-full resize-none rounded border border-gray-300 bg-white p-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/profile/${username}`}
          className="text-sm text-gray-500 hover:underline"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </form>
  )
}
