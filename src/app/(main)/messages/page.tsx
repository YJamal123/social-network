import Link from "next/link"
import { auth } from "@/lib/auth"
import { Panel } from "@/components/Panel"
import { EmptyState } from "@/components/EmptyState"
import { MessageRow } from "@/components/MessageRow"
import { getConversations } from "./actions"

export default async function MessagesPage() {
  const session = await auth()
  const viewerId = session?.user?.id ?? ""
  const conversations = await getConversations()
  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0)

  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <Panel
        title="Inbox"
        bodyClassName=""
        action={
          unreadTotal > 0 ? (
            <span className="text-caption text-outline">{unreadTotal} unread</span>
          ) : undefined
        }
      >
        {conversations.length === 0 ? (
          <EmptyState icon="mail" message="No messages yet.">
            <Link
              href="/directory"
              className="bracket-link text-action-link text-primary hover:underline"
            >
              find people
            </Link>
          </EmptyState>
        ) : (
          <div className="flex flex-col">
            {conversations.map((c) => (
              <MessageRow
                key={c.partner_id}
                partnerId={c.partner_id}
                username={c.partner_username}
                lastContent={c.last_content}
                lastSenderId={c.last_sender_id}
                viewerId={viewerId}
                createdAt={c.created_at}
                unread={c.unread}
              />
            ))}
          </div>
        )}
      </Panel>
    </main>
  )
}
