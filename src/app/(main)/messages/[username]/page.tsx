import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Panel } from "@/components/Panel"
import { Avatar } from "@/components/Avatar"
import { EmptyState } from "@/components/EmptyState"
import { MessageComposer } from "@/components/MessageComposer"
import { MessagesAck } from "@/components/MessagesAck"
import { timeAgo } from "@/lib/time"
import { getThread } from "../actions"

export default async function ThreadPage({
  params,
}: {
  params: { username: string }
}) {
  const session = await auth()
  const { partner, messages } = await getThread(params.username)
  if (!partner) notFound()

  // Can't message yourself — bounce back to the inbox.
  if (partner.id === session?.user?.id) redirect("/messages")

  const viewerId = session?.user?.id ?? ""

  return (
    <main className="mx-auto max-w-2xl px-gutter py-stack-lg">
      <MessagesAck partnerId={partner.id} />

      <div className="mb-stack-md flex items-center gap-3">
        <Link
          href="/messages"
          className="bracket-link text-action-link text-primary hover:underline"
        >
          inbox
        </Link>
        <Link
          href={`/profile/${partner.username}`}
          className="flex items-center gap-2"
        >
          <Avatar userId={partner.id} username={partner.username} size="sm" />
          <span className="text-label-bold text-primary hover:underline">
            {partner.username}
          </span>
        </Link>
      </div>

      <Panel title={`Conversation with ${partner.username}`} bodyClassName="p-4">
        {messages.length === 0 ? (
          <EmptyState
            icon="chat_bubble"
            message="No messages yet — say hello."
          />
        ) : (
          <div
            role="log"
            aria-live="polite"
            className="flex flex-col gap-2"
          >
            {messages.map((m, i) => {
              const mine = m.sender_id === viewerId
              // Last message of a consecutive same-sender run → show the avatar here.
              const isRunEnd =
                i === messages.length - 1 ||
                messages[i + 1].sender_id !== m.sender_id
              return (
                <div
                  key={m.id}
                  className={`flex max-w-[75%] items-end gap-2 ${mine ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  {/* Avatar gutter — partner side only. Avatar on run end, spacer
                      otherwise, so stacked bubbles in a run stay left-aligned. */}
                  {!mine &&
                    (isRunEnd ? (
                      <Avatar
                        userId={m.sender_id}
                        username={m.sender_username}
                        size="sm"
                      />
                    ) : (
                      <div className="w-10 shrink-0" aria-hidden="true" />
                    ))}

                  <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-body-base ${
                        mine
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container text-on-surface"
                      }`}
                    >
                      {m.content}
                    </div>
                    <span className="mt-0.5 text-body-sm text-on-surface-variant">
                      {timeAgo(m.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <MessageComposer recipientId={partner.id} username={partner.username} />
      </Panel>
    </main>
  )
}
