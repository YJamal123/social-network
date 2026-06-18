import { auth } from "@/lib/auth"
import { timeAgo } from "@/lib/time"
import { FriendRequestActions } from "@/components/FriendRequestActions"
import { Panel } from "@/components/Panel"
import { UserRow } from "@/components/UserRow"
import { EmptyState } from "@/components/EmptyState"
import { getPendingFriendRequests, getFriends } from "./actions"

export default async function FriendsPage() {
  const session = await auth()
  const requests = await getPendingFriendRequests()
  const friends = session?.user?.id ? await getFriends(session.user.id) : []

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-gutter px-gutter py-stack-lg">
      <Panel
        title="Friend Requests"
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
            icon="group_add"
            message="No one has sent you a friend request yet."
          />
        ) : (
          <div className="flex flex-col">
            {requests.map((r) => (
              <div
                key={r.requester_id}
                className="border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <UserRow
                  userId={r.user_id}
                  username={r.username}
                  subtitle={
                    <span className="text-outline">{timeAgo(r.created_at)}</span>
                  }
                  action={<FriendRequestActions requesterId={r.requester_id} />}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Your Friends"
        bodyClassName=""
        action={
          friends.length > 0 ? (
            <span className="text-caption text-outline">
              {friends.length} {friends.length === 1 ? "friend" : "friends"}
            </span>
          ) : undefined
        }
      >
        {friends.length === 0 ? (
          <EmptyState
            icon="group"
            message="No confirmed friends yet. Add people from their profile."
          />
        ) : (
          <div className="flex flex-col">
            {friends.map((f) => (
              <div
                key={f.user_id}
                className="border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container"
              >
                <UserRow
                  userId={f.user_id}
                  username={f.username}
                  subtitle={
                    <span className="text-outline">
                      friends since {timeAgo(f.created_at)}
                    </span>
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
