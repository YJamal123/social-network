import Link from "next/link"
import { timeAgo } from "@/lib/time"
import { PokeBackButton } from "@/components/PokeBackButton"
import { PokesAck } from "@/components/PokesAck"
import { Panel } from "@/components/Panel"
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
            <span className="text-[10px] text-white opacity-80">
              {pokers.length} new
            </span>
          ) : undefined
        }
      >
        {pokers.length === 0 ? (
          <div className="flex flex-col items-center gap-stack-md p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">
              touch_app
            </span>
            <p className="text-label-bold text-secondary">No one has poked you yet.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {pokers.map((p) => (
              <div
                key={p.poker_id}
                className="flex items-center gap-3 border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <Link
                  href={`/profile/${p.poker_username}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-primary bg-primary-container text-base font-bold text-white"
                >
                  {p.poker_username.charAt(0).toUpperCase()}
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
