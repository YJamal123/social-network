import { Panel } from "@/components/Panel"

export default function PokesLoading() {
  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <Panel title="Your Pokes" bodyClassName="">
        <div className="flex flex-col">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-outline-variant p-panel-padding last:border-0"
            >
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-container" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-surface-container" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-container" />
              </div>
              <div className="h-7 w-20 animate-pulse rounded bg-surface-container" />
            </div>
          ))}
        </div>
      </Panel>
    </main>
  )
}
