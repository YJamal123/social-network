import { Panel } from "@/components/Panel"

const BUBBLES = [
  { side: "mr-auto", width: "w-2/3" },
  { side: "ml-auto", width: "w-1/2" },
  { side: "mr-auto", width: "w-3/4" },
  { side: "ml-auto", width: "w-1/3" },
  { side: "mr-auto", width: "w-1/2" },
]

export default function ThreadLoading() {
  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <Panel title="Conversation" bodyClassName="p-4">
        <div className="flex flex-col gap-2">
          {BUBBLES.map((b, i) => (
            <div
              key={i}
              className={`${b.side} ${b.width} h-8 animate-pulse rounded-lg bg-surface-container`}
            />
          ))}
        </div>
      </Panel>
    </main>
  )
}
