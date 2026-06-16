import { Panel } from "@/components/Panel"

export default function DirectoryLoading() {
  return (
    <main className="mx-auto flex max-w-container-max flex-col gap-gutter px-gutter py-stack-lg">
      <Panel title="search the network">
        <div className="h-9 w-full animate-pulse rounded bg-surface-container" />
      </Panel>

      <Panel title="Directory Results" bodyClassName="">
        <div className="grid grid-cols-1 gap-px bg-outline-variant sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 bg-white p-panel-padding">
              <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-surface-container" />
              <div className="flex min-w-0 flex-grow flex-col gap-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-container" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-container" />
                <div className="h-7 w-20 animate-pulse rounded bg-surface-container" />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </main>
  )
}
