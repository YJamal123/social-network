import { timeAgo } from "@/lib/time"
import { PokeBackButton } from "@/components/PokeBackButton"
import { PokesAck } from "@/components/PokesAck"
import { Panel } from "@/components/Panel"
import { UserRow } from "@/components/UserRow"
import { EmptyState } from "@/components/EmptyState"
import { getPokers } from "./actions"

export default async function PokesPage() {
  const pokers = await getPokers()

  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      {/* Marks pokes acknowledged on mount so the header indicator clears. */}
      <PokesAck />
      <Panel
        title="Your Pokes"
        bodyClassName=""
        action={
          pokers.length > 0 ? (
            <span className="text-caption text-outline">{pokers.length} new</span>
          ) : undefined
        }
      >
        {pokers.length === 0 ? (
          <EmptyState icon="touch_app" message="No one has poked you yet." />
        ) : (
          <div className="flex flex-col">
            {pokers.map((p) => (
              <div
                key={p.poker_id}
                className="border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <UserRow
                  userId={p.poker_id}
                  username={p.poker_username}
                  subtitle={
                    <span className="text-outline">
                      poked you · {timeAgo(p.created_at)}
                    </span>
                  }
                  action={<PokeBackButton pokerId={p.poker_id} />}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
