import Link from "next/link"
import { timeAgo } from "@/lib/time"
import { PokeBackButton } from "@/components/PokeBackButton"
import { PokesAck } from "@/components/PokesAck"
import { Panel } from "@/components/Panel"
import { Avatar } from "@/components/Avatar"
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
                className="flex items-center gap-3 border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <Link href={`/profile/${p.poker_username}`} className="shrink-0">
                  <Avatar username={p.poker_username} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${p.poker_username}`}
                    className="text-label-bold text-primary hover:underline"
                  >
                    {p.poker_username}
                  </Link>
                  <p className="text-body-sm text-outline">
                    poked you · {timeAgo(p.created_at)}
                  </p>
                </div>
                <PokeBackButton pokerId={p.poker_id} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
