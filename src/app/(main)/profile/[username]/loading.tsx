import { Panel } from "@/components/Panel"

export default function ProfileLoading() {
  return (
    <main className="mx-auto flex max-w-container-max flex-col gap-gutter px-gutter py-stack-lg md:flex-row">
      {/* Left rail */}
      <aside className="flex w-full shrink-0 flex-col gap-stack-lg md:w-52">
        <div className="rounded-lg bg-surface-container-lowest p-panel-padding shadow">
          <div className="aspect-square w-full animate-pulse rounded-lg bg-surface-container" />
        </div>
      </aside>

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col gap-stack-lg">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 rounded-lg bg-surface-container-lowest p-4 shadow sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="h-7 w-40 animate-pulse rounded bg-surface-container" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-container" />
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="h-10 w-12 animate-pulse rounded bg-surface-container" />
            <div className="h-10 w-12 animate-pulse rounded bg-surface-container" />
            <div className="h-10 w-12 animate-pulse rounded bg-surface-container" />
          </div>
        </div>

        {/* Information */}
        <Panel title="Information">
          <div className="flex flex-col gap-3">
            <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-container" />
          </div>
        </Panel>

        {/* The Wall */}
        <Panel title="The Wall">
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 border-b border-outline-variant pb-3 last:border-0 last:pb-0"
              >
                <div className="h-4 w-28 animate-pulse rounded bg-surface-container" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />
              </div>
            ))}
          </div>
        </Panel>

        {/* Posts */}
        <section className="flex flex-col gap-stack-md">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-container" />
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg bg-surface-container-lowest p-4 shadow"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 animate-pulse rounded-lg bg-surface-container" />
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-surface-container" />
                  <div className="h-3 w-20 animate-pulse rounded bg-surface-container" />
                </div>
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-surface-container" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-surface-container" />
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
