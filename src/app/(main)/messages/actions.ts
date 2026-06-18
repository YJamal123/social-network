"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
import { validateMessage } from "@/lib/validation"
import type { ConversationSummary, MessageWithSender } from "@/lib/types"

export type MessageState = { error?: string }

// Send a private 1:1 message. Self-message is silently ignored. Validates the
// body in app code (not just the DB CHECK) so length/empty errors surface
// cleanly. Revalidates the thread + inbox so indicators stay in sync.
export async function sendMessage(
  recipientId: string,
  content: string
): Promise<MessageState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  const senderId = session.user.id
  if (senderId === recipientId) {
    // Ignore self-message — not an error, just a no-op.
    return {}
  }

  const v = validateMessage(content)
  if (!v.ok) {
    return { error: v.error }
  }

  try {
    await getPrisma().message.create({
      data: { senderId, recipientId, content: v.value },
    })
  } catch (err) {
    console.error("Send message failed:", err)
    return { error: "Failed to send message" }
  }

  revalidatePath("/messages/[username]", "page")
  revalidatePath("/messages")
  return {}
}

// Count messages aimed at the current user that they haven't read yet. Used by
// the SiteHeader indicator. Returns 0 when logged out or on error.
export async function getUnreadMessageCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) {
    return 0
  }

  try {
    return await getPrisma().message.count({
      where: { recipientId: session.user.id, read: false },
    })
  } catch (err) {
    console.error("Count unread messages failed:", err)
    return 0
  }
}

// List the current user's conversations — one row per correspondent, newest
// activity first. Each row carries the last message snippet, who sent it, and
// the count of unread messages FROM that partner. Returns [] when logged out.
export async function getConversations(): Promise<ConversationSummary[]> {
  const session = await auth()
  if (!session?.user?.id) {
    return []
  }

  try {
    const viewerId = session.user.id
    return await getPrisma().$queryRaw<ConversationSummary[]>`
      WITH threads AS (
        SELECT
          CASE WHEN m.sender_id = ${viewerId}::uuid THEN m.recipient_id ELSE m.sender_id END AS partner_id,
          m.content, m.created_at, m.sender_id
        FROM messages m
        WHERE m.sender_id = ${viewerId}::uuid OR m.recipient_id = ${viewerId}::uuid
      ),
      last_msg AS (
        SELECT DISTINCT ON (partner_id)
          partner_id,
          content    AS last_content,
          created_at,
          sender_id  AS last_sender_id
        FROM threads
        ORDER BY partner_id, created_at DESC
      ),
      unread AS (
        SELECT sender_id AS partner_id, COUNT(*)::int AS unread
        FROM messages
        WHERE recipient_id = ${viewerId}::uuid AND read = false
        GROUP BY sender_id
      )
      SELECT lm.partner_id,
             u.username AS partner_username,
             lm.last_content,
             lm.last_sender_id,
             lm.created_at,
             COALESCE(ur.unread, 0) AS unread
      FROM last_msg lm
      JOIN users u        ON u.id = lm.partner_id
      LEFT JOIN unread ur ON ur.partner_id = lm.partner_id
      ORDER BY lm.created_at DESC`
  } catch (err) {
    console.error("Get conversations failed:", err)
    return []
  }
}

// Load a single conversation thread with a given correspondent (resolved by
// username), chronological oldest→newest. Returns a partner descriptor (for the
// header + composer) plus the messages. Returns null partner when logged out or
// the username doesn't exist.
export async function getThread(
  username: string
): Promise<{ partner: { id: string; username: string } | null; messages: MessageWithSender[] }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { partner: null, messages: [] }
  }

  const partner = await getPrisma().user.findUnique({
    where: { username },
    select: { id: true, username: true },
  })
  if (!partner) {
    return { partner: null, messages: [] }
  }

  const viewerId = session.user.id
  const messages = await getPrisma().$queryRaw<MessageWithSender[]>`
    SELECT m.id, m.sender_id, m.recipient_id, m.content, m.read, m.created_at,
           u.username AS sender_username
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ${viewerId}::uuid AND m.recipient_id = ${partner.id}::uuid)
       OR (m.sender_id = ${partner.id}::uuid AND m.recipient_id = ${viewerId}::uuid)
    ORDER BY m.created_at ASC`
  return { partner, messages }
}

// Mark every message from one correspondent to the current user as read, so the
// SiteHeader indicator clears. Called when a thread is opened (MessagesAck).
export async function markThreadRead(partnerId: string): Promise<MessageState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in" }
  }

  try {
    await getPrisma().message.updateMany({
      where: { recipientId: session.user.id, senderId: partnerId, read: false },
      data: { read: true },
    })
  } catch (err) {
    console.error("Mark thread read failed:", err)
    return { error: "Failed to mark read" }
  }

  revalidatePath("/messages")
  return {}
}
