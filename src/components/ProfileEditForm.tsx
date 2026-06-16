"use client"

import { useFormState } from "react-dom"
import Link from "next/link"
import { updateProfile } from "@/app/(main)/profile/actions"
import { Panel } from "@/components/Panel"

const MAX_BIO = 280
const MAX_RELATIONSHIP = 50
const MAX_INTERESTS = 280
const MAX_COURSES = 280

const fieldClass =
  "mt-1 w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
const labelClass = "block text-label-bold text-secondary"

export function ProfileEditForm({
  username,
  initialBio,
  initialRelationshipStatus,
  initialInterests,
  initialCourses,
}: {
  username: string
  initialBio: string
  initialRelationshipStatus: string
  initialInterests: string
  initialCourses: string
}) {
  const [state, formAction] = useFormState(updateProfile, {})

  return (
    <Panel title="Edit Profile">
      <form action={formAction} className="space-y-3">
        {state.error && (
          <p className="rounded bg-error-container p-2 text-body-sm text-error">
            {state.error}
          </p>
        )}

        <label className={labelClass}>
          Bio
          <textarea
            name="bio"
            defaultValue={initialBio}
            maxLength={MAX_BIO}
            rows={4}
            placeholder="Tell people about yourself"
            className={`${fieldClass} resize-none`}
          />
        </label>

        <label className={labelClass}>
          Relationship status
          <input
            type="text"
            name="relationship_status"
            defaultValue={initialRelationshipStatus}
            maxLength={MAX_RELATIONSHIP}
            placeholder="e.g. Single, In a relationship, It's complicated"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Interests
          <textarea
            name="interests"
            defaultValue={initialInterests}
            maxLength={MAX_INTERESTS}
            rows={2}
            placeholder="Music, movies, books…"
            className={`${fieldClass} resize-none`}
          />
        </label>

        <label className={labelClass}>
          Courses
          <textarea
            name="courses"
            defaultValue={initialCourses}
            maxLength={MAX_COURSES}
            rows={2}
            placeholder="Classes you're taking"
            className={`${fieldClass} resize-none`}
          />
        </label>

        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/profile/${username}`}
            className="text-body-sm text-outline hover:underline"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-1.5 text-label-bold text-on-primary transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
    </Panel>
  )
}
