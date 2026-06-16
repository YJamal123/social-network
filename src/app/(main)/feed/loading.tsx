import { Panel } from "@/components/Panel"

export default function FeedLoading() {
  return (
    <main className="mx-auto grid max-w-container-max grid-cols-1 gap-gutter px-gutter py-stack-lg md:grid-cols-12">
      <aside className="flex flex-col gap-stack-lg md:col-span-4 lg:col-span-3">
        <Panel title="Quick Search">
          <div className="flex flex-col gap-stack-md">
            <div className="h-9 w-full animate-pulse rounded bg-surface-container" />
            <div className="h-9 w-full animate-pulse rounded bg-surface-container" />
          </div>
        </Panel>

        <Panel title="Navigation">
          <div className="flex flex-col gap-stack-md">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-container" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-container" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-surface-container" />
          </div>
        </Panel>
      </aside>

      <section className="flex flex-col gap-stack-lg md:col-span-8 lg:col-span-9">
        <div className="h-7 w-24 animate-pulse rounded bg-surface-container" />
        <div className="rounded-lg bg-surface-container-lowest p-4 shadow">
          <div className="h-20 w-full animate-pulse rounded bg-surface-container" />
        </div>
        <div className="flex flex-col gap-stack-lg">
          {[0, 1, 2].map((i) => (
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
        </div>
      </section>
    </main>
  )
}
