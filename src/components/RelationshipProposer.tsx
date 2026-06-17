"use client"

import { useState, useTransition } from "react"
import { proposeRelationshipByUsername } from "@/app/(main)/profile/actions"
import { RELATIONSHIP_STATUSES } from "@/lib/relationships"
import { fieldClass, buttonClass } from "@/lib/ui"

const labelClass = "block text-label-bold text-secondary"

// Propose a linked relationship to another user by username. Mirrors the
// PokeButton pattern: a button (not a form submit, so it never triggers the
// surrounding updateProfile form) running the action inside a transition and
// surfacing { error } inline. The partner must confirm before it shows publicly.
export function RelationshipProposer() {
  const [status, setStatus] = useState<string>(RELATIONSHIP_STATUSES[0])
  const [partner, setPartner] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function handlePropose() {
    setError(null)
    setSent(false)
    startTransition(async () => {
      const result = await proposeRelationshipByUsername(partner, status)
      if (result.error) {
        setError(result.error)
      } else {
        setSent(true)
        setPartner("")
      }
    })
  }

  return (
    <div className="space-y-3 border-t border-outline-variant pt-4">
      <p className="text-body-sm text-secondary">
        Link a relationship — your partner must confirm before it appears on
        either profile.
      </p>

      {error && (
        <p className="rounded bg-error-container p-2 text-body-sm text-error">
          {error}
        </p>
      )}
      {sent && (
        <p className="rounded bg-secondary-container p-2 text-body-sm text-on-surface">
          Request sent — waiting for confirmation.
        </p>
      )}

      <label className={labelClass}>
        Relationship type
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${fieldClass} mt-1`}
        >
          {RELATIONSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Partner&apos;s username
        <input
          type="text"
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          placeholder="e.g. mark"
          className={`${fieldClass} mt-1`}
        />
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handlePropose}
          disabled={pending || partner.trim().length === 0}
          className={buttonClass.outline}
        >
          {pending ? "Sending…" : "Propose"}
        </button>
      </div>
    </div>
  )
}
