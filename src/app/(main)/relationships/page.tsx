import { timeAgo } from "@/lib/time"
import { RelationshipConfirmButton } from "@/components/RelationshipConfirmButton"
import { Panel } from "@/components/Panel"
import { UserRow } from "@/components/UserRow"
import { EmptyState } from "@/components/EmptyState"
import { getPendingRelationshipRequests } from "../profile/actions"

export default async function RelationshipsPage() {
  const requests = await getPendingRelationshipRequests()

  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <Panel
        title="Relationship Requests"
        bodyClassName=""
        action={
          requests.length > 0 ? (
            <span className="text-caption text-outline">
              {requests.length} pending
            </span>
          ) : undefined
        }
      >
        {requests.length === 0 ? (
          <EmptyState
            icon="favorite"
            message="No one has proposed a relationship yet."
          />
        ) : (
          <div className="flex flex-col">
            {requests.map((r) => (
              <div
                key={r.requester_id}
                className="border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <UserRow
                  userId={r.requester_id}
                  username={r.partner_username}
                  subtitle={
                    <span className="text-outline">
                      {r.status} · {timeAgo(r.created_at)}
                    </span>
                  }
                  action={
                    <RelationshipConfirmButton requesterId={r.requester_id} />
                  }
                />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
