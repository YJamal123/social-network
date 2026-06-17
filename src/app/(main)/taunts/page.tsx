import { timeAgo } from "@/lib/time"
import { TauntBackButton } from "@/components/TauntBackButton"
import { TauntsAck } from "@/components/TauntsAck"
import { Panel } from "@/components/Panel"
import { UserRow } from "@/components/UserRow"
import { EmptyState } from "@/components/EmptyState"
import { getTaunters } from "./actions"

export default async function TauntsPage() {
  const taunters = await getTaunters()

  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      {/* Marks taunts acknowledged on mount so the header indicator clears. */}
      <TauntsAck />
      <Panel
        title="Your Taunts"
        bodyClassName=""
        action={
          taunters.length > 0 ? (
            <span className="text-caption text-outline">{taunters.length} new</span>
          ) : undefined
        }
      >
        {taunters.length === 0 ? (
          <EmptyState icon="sports_kabaddi" message="No one has taunted you yet." />
        ) : (
          <div className="flex flex-col">
            {taunters.map((t) => (
              <div
                key={t.taunter_id}
                className="border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <UserRow
                  userId={t.taunter_id}
                  username={t.taunter_username}
                  subtitle={
                    <span className="text-outline">
                      {t.taunter_school ? `${t.taunter_school} · ` : ""}
                      taunted you · {timeAgo(t.created_at)}
                    </span>
                  }
                  action={<TauntBackButton taunterId={t.taunter_id} />}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
