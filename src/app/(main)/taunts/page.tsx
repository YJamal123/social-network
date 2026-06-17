import { timeAgo } from "@/lib/time"
import { TauntBackButton } from "@/components/TauntBackButton"
import { TauntsAck } from "@/components/TauntsAck"
import { Panel } from "@/components/Panel"
import { UserRow } from "@/components/UserRow"
import { EmptyState } from "@/components/EmptyState"
import { getTaunters, getViewerSchool, getHeadToHead } from "./actions"

export default async function TauntsPage() {
  const [taunters, viewerSchool] = await Promise.all([
    getTaunters(),
    getViewerSchool(),
  ])

  // Anchor the scoreboard on the viewer's school vs their most recent rival
  // taunter, falling back to the classic Cornell–Harvard demo pairing.
  const schoolA = viewerSchool ?? "Cornell"
  const recentRival = taunters.find(
    (t) => t.taunter_school && t.taunter_school !== schoolA
  )?.taunter_school
  const schoolB = recentRival ?? (schoolA === "Harvard" ? "Cornell" : "Harvard")
  const { a, b } = await getHeadToHead(schoolA, schoolB)

  return (
    <main className="mx-auto max-w-2xl space-y-stack-lg px-gutter py-stack-lg">
      {/* Marks taunts acknowledged on mount so the header indicator clears. */}
      <TauntsAck />
      <Panel title="Rivalry scoreboard" bodyClassName="p-panel-padding">
        <div className="flex items-center justify-center gap-4 text-on-surface">
          <span className="text-label-bold">{schoolA}</span>
          <span className="text-section-header tabular-nums">
            {a} — {b}
          </span>
          <span className="text-label-bold">{schoolB}</span>
        </div>
      </Panel>
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
