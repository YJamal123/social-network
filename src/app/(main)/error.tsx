"use client"

import { Panel } from "@/components/Panel"
import { buttonClass } from "@/lib/ui"

// Error boundary for the (main) route group. A cold Cloud Run + Cloud SQL socket
// can throw on the server queries each page runs; this renders an on-brand Panel
// with an error-container banner and a "Try again" button that re-runs the
// segment via reset() instead of leaving an unstyled Next overlay.
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <Panel title="Something went wrong">
        <div className="flex flex-col gap-stack-md">
          <p className="rounded bg-error-container p-2 text-body-sm text-error">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          <div>
            <button type="button" onClick={() => reset()} className={buttonClass.primary}>
              Try again
            </button>
          </div>
        </div>
      </Panel>
    </main>
  )
}
