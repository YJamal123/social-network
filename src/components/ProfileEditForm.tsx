"use client"

import { useFormState } from "react-dom"
import Link from "next/link"
import { updateProfile } from "@/app/(main)/profile/actions"
import { Panel } from "@/components/Panel"
import { RelationshipProposer } from "@/components/RelationshipProposer"
import { fieldClass } from "@/lib/ui"
import { SCHOOLS } from "@/lib/schools"
import {
  INTERESTED_IN,
  LOOKING_FOR,
  parseSelections,
} from "@/lib/profileFields"

const MAX_BIO = 280
const MAX_RELATIONSHIP = 50
const MAX_INTERESTS = 280
const MAX_COURSES = 280

const labelClass = "block text-label-bold text-secondary"

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string
  name: string
  options: readonly string[]
  selected: string[]
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <label
            key={option}
            className="flex items-center gap-1.5 text-body-sm text-on-surface"
          >
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={selected.includes(option)}
              className="accent-primary"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ProfileEditForm({
  username,
  initialBio,
  initialRelationshipStatus,
  initialInterests,
  initialCourses,
  initialSchool,
  initialInterestedIn,
  initialLookingFor,
}: {
  username: string
  initialBio: string
  initialRelationshipStatus: string
  initialInterests: string
  initialCourses: string
  initialSchool: string
  initialInterestedIn: string
  initialLookingFor: string
}) {
  const [state, formAction] = useFormState(updateProfile, {})
  const interestedIn = parseSelections(initialInterestedIn)
  const lookingFor = parseSelections(initialLookingFor)

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
            className={`${fieldClass} mt-1 resize-none`}
          />
        </label>

        <label className={labelClass}>
          School
          <select
            name="school"
            defaultValue={initialSchool}
            required
            className={`${fieldClass} mt-1`}
          >
            <option value="" disabled>
              Select your school
            </option>
            {SCHOOLS.map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Relationship status
          <input
            type="text"
            name="relationship_status"
            defaultValue={initialRelationshipStatus}
            maxLength={MAX_RELATIONSHIP}
            placeholder="e.g. Single, In a relationship, It's complicated"
            className={`${fieldClass} mt-1`}
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
            className={`${fieldClass} mt-1 resize-none`}
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
            className={`${fieldClass} mt-1 resize-none`}
          />
        </label>

        <CheckboxGroup
          legend="Interested in"
          name="interested_in"
          options={INTERESTED_IN}
          selected={interestedIn}
        />

        <CheckboxGroup
          legend="Looking for"
          name="looking_for"
          options={LOOKING_FOR}
          selected={lookingFor}
        />

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

      <div className="mt-4">
        <RelationshipProposer />
      </div>
    </Panel>
  )
}
