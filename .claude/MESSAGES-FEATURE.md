# SML — Private Messages (build spec / single source of truth)

**Vision:** Add the one iconic TheFacebook-2004 mechanic still missing — the private **Inbox**. Strict 1:1 direct messages between two users, surfaced as a conversation-list Inbox at `/messages`, a per-correspondent thread at `/messages/[username]`, a **"Message"** button on profiles next to Poke/Taunt/Follow, and an unread-count badge in `SiteHeader`. Demo narrative: **profile → "Message" → land in thread → type + Send → recipient logs in, sees the unread badge on `messages` → opens Inbox → opens thread (badge clears) → replies.** Zero new infra: page-load + `revalidatePath`, no websockets, exactly like poke/wall.

This is a **build spec**. It synthesizes four design memos (product/era, data/SQL, codebase-reuse/arch, UI/UX/a11y) into one internally-consistent plan that obeys every `CLAUDE.md` guardrail. The Messages stack is a **content-bearing fork of the poke stack** (single flat table, derived pair semantics, `read`-flag unread mirroring `pokes.acknowledged`).

---

## Resolved conflicts (decisions where the memos disagreed)

| # | Conflict | Decision | Why |
|---|---|---|---|
| 1 | `read BOOLEAN` (arch/reuse memo) vs `read_at TIMESTAMPTZ` (data memo) | **`read BOOLEAN NOT NULL DEFAULT false`** | Byte-for-byte mirror of `pokes.acknowledged`. `getUnreadMessageCount` / `markThreadRead` become copy-paste of the poke equivalents. No sender-side "seen at" UI is in scope, so the timestamp buys nothing. Maximum parity > minor expressiveness. |
| 2 | Route-based pages vs single two-pane SPA | **Route-based**: `/messages` (Inbox list) + `/messages/[username]` (thread). No persistent left rail, one route at a time. | Matches the app's no-realtime, page-load + `revalidatePath` model and the existing list→detail shape (pokes list + `/profile/[username]`). Free per-segment `loading.tsx`; deep-linkable; back-button correct. A two-pane SPA implies client pane-swapping that fights the model. |
| 3 | Profile "Message" button: mutation vs inline composer vs navigation | **Plain `<Link href={/messages/${username}}>` styled `buttonClass.outline`** dropped into the Connection panel. No new client component, no mutation. | Lowest-risk entry. Composing happens in the thread. Keeps the Connection panel uncluttered and avoids a redundant `MessageButton.tsx`. |
| 4 | Content length: 280 vs longer (1000–2000) | **280**, `CHECK (char_length(content) <= 280)` | Every content table (posts/comments/wall_posts) is 280. Lets `MessageComposer` fork `WallComposer`/`CommentSection` verbatim and reuse the shared validation helper + Vitest gate. Consistency > literalism. |
| 5 | Header badge: total unread messages vs distinct-conversation count | **Total unread message count** | Matches poke/taunt/relationship raw-`COUNT(*)` semantics. Lowest surprise; badge markup is identical except color. |
| 6 | Badge / unread color: coral vs navy | **Navy: `bg-primary text-on-primary`** for the messages chip (NOT coral). | `CLAUDE.md`/tokens reserve coral strictly for the social-ping mechanics (like/poke/taunt/relationship). Messages are core navigation, not a ping; a navy chip lets a user distinguish "unread message" from "new poke" in the same nav row. **Load-bearing — do not revert to `bg-coral`.** |
| 7 | Inbox row navigation: wrap `UserRow` in a `<Link>` vs dedicated row | **Dedicated `MessageRow` (one single `<Link>` to the thread)**, NOT `UserRow` wrapped in a Link. | `UserRow` already wraps avatar+username in `/profile` links; wrapping the whole row in a second `<Link>` nests anchors (invalid HTML, hydration warning). |
| 8 | Optimistic send + Enter-to-send | **Cut for v1.** Mirror `WallComposer` exactly: `useTransition`, inline error, clear-on-success, button-only submit, 280 counter. | Keeps strict parity with the app's proven composer contract (no `useOptimistic`, no Enter-to-send anywhere else). Reduces a11y/IME-composition risk. Flagged as Phase-2. |
| 9 | Inbox snippet: verbatim vs "You: " prefix when viewer sent last | **"You: " prefix** when `last_sender_id === viewer`. | Era-authentic threaded inbox; needs `last_sender_id` on the query (already included). |

---

## Scope

**IN (v1):**
1. Private 1:1 messages — one `sender_id`, one `recipient_id`, `content ≤ 280`, `read` flag.
2. `/messages` Inbox — one row per correspondent, newest-activity-first, snippet + `timeAgo`, navy unread chip per row.
3. `/messages/[username]` thread — chronological (oldest→newest) bubbles, sent-vs-received styling via Tailwind alignment/tokens, reply composer pinned at the bottom; marks the conversation read on mount.
4. Profile **"Message"** link in the Connection panel (gated `!isOwnProfile && session?.user?.id`).
5. `SiteHeader` `messages` nav link + navy unread badge in BOTH the desktop (`md:flex`) and mobile (`md:hidden`) navs.
6. Mark-as-read on thread open (`MessagesAck` client component → `markThreadRead`).
7. `loading.tsx` skeletons for both routes; reuse the shared `(main)/error.tsx` boundary.
8. Optional demo seed rows.

**OUT (explicit non-goals, v1):** group/multi-party threads; realtime/websockets/polling; attachments/images; typing indicators; read-receipts shown to the SENDER; delete/unsend/edit; recipient-search "Compose" picker (reach people via profile/directory); message reactions/likes; message search; pagination; optimistic send; Enter-to-send; persistent two-pane left rail.

**Privacy gate:** **open to anyone** (like poke) — no follow/mutual requirement to message. Self-message no-ops/rejects; the "Message" link is hidden on your own profile.

---

## Schema DDL

Append to the `SCHEMA` string in `src/app/api/migrate/route.ts`, **after the `relationships` block (line ~95) and before the `ALTER TABLE users` lines (line ~97)**. Idempotent, column-aligned to match the existing tables:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL CHECK (char_length(content) <= 280),
  read         BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at DESC);
```

Notes: surrogate UUID PK (many rows per pair, like posts/comments/wall_posts). `read BOOLEAN` (conflict #1). Inline `CHECK (sender_id <> recipient_id)` is belt-and-suspenders; the server-action no-op is the real guarantor (PG has no `ADD CONSTRAINT IF NOT EXISTS`, so the inline CHECK only applies on first creation — acceptable for a brand-new table). `messages_recipient_id_idx` powers the unread badge; `messages_pair_idx` powers the thread scan.

---

## Types (append to `src/lib/types.ts`)

```ts
// A private 1:1 direct message
export interface Message {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  read: boolean
  created_at: string
}

// A message joined with the sender's username — used in the thread view
export interface MessageWithSender extends Message {
  sender_username: string
}

// One row per conversation partner — the /messages inbox list
export interface ConversationSummary {
  partner_id: string
  partner_username: string
  last_content: string
  last_sender_id: string   // so the UI can show a "You: " prefix
  created_at: string       // timestamp of the last message
  unread: number           // unread messages FROM partner TO me
}
```

---

## Pure logic to test (Vitest gate)

Add to `src/lib/validation.ts` and `src/lib/validation.test.ts` (mirror `validateComment` exactly — do NOT create a new file):

```ts
export const MAX_MESSAGE_LENGTH = 280

/** Validate a direct message. Same rules as a comment: non-empty, ≤280 chars. */
export function validateMessage(content: string): ValidationResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, error: "Message cannot be empty" }
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "Message must be 280 characters or fewer" }
  }
  return { ok: true, value: trimmed }
}
```

`validation.test.ts`: add a `describe("validateMessage", ...)` block mirroring the `validateComment` tests — accepts trimmed content, rejects empty, rejects whitespace-only, accepts exactly `MAX_MESSAGE_LENGTH`, rejects `MAX_MESSAGE_LENGTH + 1`.

`sendMessage` MUST call `validateMessage` and surface `{ error }` rather than relying on the DB `CHECK` (a CHECK violation throws and would surface only the generic catch message).

---

## Server actions — `src/app/(main)/messages/actions.ts` (`"use server"`)

Fork of `pokes/actions.ts`. Imports: `revalidatePath` (next/cache), `auth` (@/lib/auth), `query` (@/lib/db), `validateMessage` (@/lib/validation), types. **Never import any symbol from this file into `auth.config.ts` or `middleware.ts`** (edge boundary).

```ts
export type MessageState = { error?: string }
```

| Action | Signature | Behavior |
|---|---|---|
| `sendMessage` | `(recipientId: string, content: string): Promise<MessageState>` | `auth()` guard → `{ error: "You must be logged in" }` if no `session.user.id`. Self-guard: if `senderId === recipientId` return `{}` (no-op). `const v = validateMessage(content)`; if `!v.ok` return `{ error: v.error }`. `INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1,$2,$3)` with `v.value`. try/catch → `{ error: "Failed to send message" }`. Then `revalidatePath("/messages/[username]", "page")` + `revalidatePath("/messages")`. Return `{}`. |
| `getUnreadMessageCount` | `(): Promise<number>` | Mirror `getUnacknowledgedPokeCount`. `SELECT COUNT(*)::int AS count FROM messages WHERE recipient_id = $1 AND read = false`. Returns 0 logged-out / on error. |
| `getConversations` | `(): Promise<ConversationSummary[]>` | Inbox list, one row per partner, newest-activity-first. SQL below. Returns `[]` logged-out. |
| `getThread` | `(username: string): Promise<{ partner: { id: string; username: string } \| null; messages: MessageWithSender[] }>` | Resolve `SELECT id, username FROM users WHERE username = $1`; if not found return `{ partner: null, messages: [] }`. Then run the thread SELECT below (`$1` = me, `$2` = partner id). Returns the partner descriptor for the composer/header + the chronological messages. Returns `{ partner: null, messages: [] }` logged-out. |
| `markThreadRead` | `(partnerId: string): Promise<MessageState>` | Mirror `acknowledgePokes`, scoped to one correspondent. `auth()` guard. `UPDATE messages SET read = true WHERE recipient_id = $1 AND sender_id = $2 AND read = false`. try/catch → `{ error: "Failed to mark read" }`. `revalidatePath("/messages")`. Return `{}`. |

**Inbox query** (`getConversations`, `$1` = current user id):

```sql
WITH threads AS (
  SELECT
    CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS partner_id,
    m.content, m.created_at, m.sender_id
  FROM messages m
  WHERE m.sender_id = $1 OR m.recipient_id = $1
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
  WHERE recipient_id = $1 AND read = false
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
ORDER BY lm.created_at DESC;
```

(DISTINCT ON requires the inner `ORDER BY partner_id, created_at DESC`; the outer query re-sorts newest-conversation-first.)

**Thread query** (`getThread`, `$1` = me, `$2` = partner id):

```sql
SELECT m.id, m.sender_id, m.recipient_id, m.content, m.read, m.created_at,
       u.username AS sender_username
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE (m.sender_id = $1 AND m.recipient_id = $2)
   OR (m.sender_id = $2 AND m.recipient_id = $1)
ORDER BY m.created_at ASC;
```

---

## Files to create

| Path | Purpose |
|---|---|
| `src/app/(main)/messages/actions.ts` | `"use server"` — `sendMessage`, `getUnreadMessageCount`, `getConversations`, `getThread`, `markThreadRead`, `MessageState`. Fork of `pokes/actions.ts`. |
| `src/app/(main)/messages/page.tsx` | Server component. Inbox. `await getConversations()`. `<main className="mx-auto max-w-2xl px-gutter py-stack-lg">` + `<Panel title="Inbox">`. Empty → `<EmptyState icon="mail" message="No messages yet." />` with a child bracket-link to `/directory`. Else map `ConversationSummary` → `<MessageRow ...>`. |
| `src/app/(main)/messages/loading.tsx` | Skeleton. Clone `pokes/loading.tsx` verbatim, title `"Inbox"` (4 pulse list rows). |
| `src/app/(main)/messages/[username]/page.tsx` | Server component. Thread. `const { partner, messages } = await getThread(params.username)`; `if (!partner) notFound()`. Self-thread guard: if `partner.id === session.user.id` → `redirect("/messages")`. Top strip: `[ inbox ]` bracket-link + partner Avatar(sm)+username link to `/profile/[username]`. `<MessagesAck partnerId={partner.id} />`. `<Panel title={`Conversation with ${partner.username}`} bodyClassName="p-4">` with `role="log" aria-live="polite"` bubble list; empty → `<EmptyState icon="chat_bubble" message="No messages yet — say hello." />` above the composer. `<MessageComposer recipientId={partner.id} username={partner.username} />` pinned at the bottom. |
| `src/app/(main)/messages/[username]/loading.tsx` | Skeleton. `<Panel title="Conversation">` with ~5 alternating-aligned pulse bubbles (mix `ml-auto`/`mr-auto`, varied widths, `rounded-lg h-8 bg-surface-container animate-pulse`). max-w-2xl shell to match the page. |
| `src/components/MessageRow.tsx` | Server component. ONE `<Link href={`/messages/${username}`}>` wrapping Avatar(sm) + username (`text-label-bold`) + snippet (`"You: " + last_content` when `last_sender_id === viewerId`, truncated; `text-on-surface font-medium` when unread else `text-on-surface-variant`) + right side: `timeAgo(created_at)` + navy unread chip when `unread > 0`. Row: `flex items-center gap-3 border-b border-outline-variant p-panel-padding transition-colors last:border-0 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container`. Unread left accent: `<span className="h-8 w-1 shrink-0 rounded-full bg-periwinkle" aria-hidden />`. Props: `{ partnerId, username, lastContent, lastSenderId, viewerId, createdAt, unread }`. |
| `src/components/MessageComposer.tsx` | `"use client"`. Clone of `WallComposer`. Props `{ recipientId: string; username: string }`. `useTransition`, inline `text-error`, clear-on-success, `maxLength={280}` + `{n}/280` counter, `${fieldClass} min-h-composer resize-none`, `buttonClass.primary`. Calls `sendMessage(recipientId, content)`. Button `"Send"`/`"Sending…"`. `<label className="sr-only" htmlFor="message-input">Message {username}</label>` + `id="message-input" aria-label={`Message ${username}`}`. Button `disabled={pending || content.trim().length === 0}`. |
| `src/components/MessagesAck.tsx` | `"use client"`. Clone of `PokesAck`. Props `{ partnerId: string }`. `useEffect(() => { void markThreadRead(partnerId) }, [partnerId])`; returns null. |

No `MessageButton.tsx` (conflict #3 — plain Link).

---

## Files to modify

| Path | Change |
|---|---|
| `src/app/api/migrate/route.ts` | Append the `messages` table + two indexes to the `SCHEMA` string, after the `relationships` block, before `ALTER TABLE users`. |
| `src/lib/types.ts` | Append `Message`, `MessageWithSender`, `ConversationSummary`. |
| `src/lib/validation.ts` | Add `MAX_MESSAGE_LENGTH = 280` and `validateMessage`. |
| `src/lib/validation.test.ts` | Add `describe("validateMessage", ...)` mirroring `validateComment` (import `validateMessage`, `MAX_MESSAGE_LENGTH`). |
| `src/components/SiteHeader.tsx` | Import `getUnreadMessageCount` from `@/app/(main)/messages/actions`. Add `const messageCount = username ? await getUnreadMessageCount() : 0`. Insert a `messages` `<Link href="/messages">` + dot-separator in BOTH the `md:flex` nav (after `profile`, before logout, or alongside pokes/taunts) AND the `md:hidden` mobile nav. Badge markup mirrors the poke badge BUT `bg-primary text-on-primary` (NOT `bg-coral text-white`); `aria-label={`${messageCount} unread messages`} aria-live="polite"`. |
| `src/app/(main)/profile/[username]/page.tsx` | In the `!isOwnProfile && session?.user?.id` Connection `<Panel>`, inside the existing `<div className="flex gap-2">`, add `<Link href={`/messages/${profile.username}`} className={buttonClass.outline}>Message</Link>`. Import `buttonClass` from `@/lib/ui` (`Link` already imported). |
| `src/app/api/seed/route.ts` (optional, recommended) | Add a `MESSAGES: [number, number, string, boolean][]` const (senderIdx, recipientIdx, content, read) + an insert loop mirroring the WALL_POSTS loop with `now() - interval` spread (no ON CONFLICT — fresh rows). Leave a few `read=false` so the badge shows. Add `messages: messageCount` to the returned `counts`. The delete-demo CASCADE already wipes messages (FK ON DELETE CASCADE). |

---

## UI / states plan

- **Inbox `/messages`:** `Panel title="Inbox"`, optional `action` = `{unreadTotal} unread` caption. Rows via `MessageRow` (single Link → thread). Unread rows: periwinkle left accent + `font-medium` snippet + navy chip. Read rows: plain, `text-on-surface-variant` snippet.
- **Thread `/messages/[username]`:** top strip with `[ inbox ]` back link + partner identity. Bubbles in a `role="log" aria-live="polite"` container: viewer-authored → `ml-auto bg-primary text-on-primary`; partner → `bg-surface-container text-on-surface`; both `rounded-lg px-3 py-2 max-w-[75%] whitespace-pre-wrap break-words text-body-base`, small `timeAgo` label under each in `text-body-sm text-on-surface-variant`. Oldest top, newest bottom. Composer pinned below.
- **Empty inbox:** `EmptyState icon="mail" message="No messages yet."` + child bracket-link to `/directory`.
- **Empty thread:** `EmptyState icon="chat_bubble" message="No messages yet — say hello."` above the (still usable) composer.
- **Loading:** `messages/loading.tsx` (4 list-pulse rows, title "Inbox"); `messages/[username]/loading.tsx` (alternating bubble pulses, title "Conversation").
- **Error:** rely on the existing shared `(main)/error.tsx` boundary — no per-segment error file.
- **Disabled/sending:** submit `disabled={pending || content.trim().length === 0}`, label `"Sending…"` while pending (mirrors WallComposer `"Posting…"`).
- **Mark-read:** `MessagesAck` fires `markThreadRead` on mount; badge/inbox-row clear on next server render (navigation) — same fire-and-forget parity as pokes.
- **A11y:** every interactive element inherits focus rings via `buttonClass`/`fieldClass`; `MessageRow` Link carries an explicit `focus-visible:ring-2 ring-secondary-container`. Badge `aria-label` + `aria-live="polite"` on both nav chip and row chip. Composer `sr-only` label + `aria-label`. Thread list `role="log"`.
- **Mobile:** `messages` + chip added to BOTH nav blocks; pages use `max-w-2xl` which collapses gracefully; bubbles `max-w-[75%]`.
- **No raw hex / no inline `style={}`** — periwinkle, primary, on-primary, surface tokens already exist in `tailwind.config.ts`.

---

## Build checklist (ordered)

1. Append the `messages` DDL + indexes to the `SCHEMA` string in `src/app/api/migrate/route.ts`.
2. Add `Message`, `MessageWithSender`, `ConversationSummary` to `src/lib/types.ts`.
3. Add `MAX_MESSAGE_LENGTH` + `validateMessage` to `src/lib/validation.ts`; add the `validateMessage` tests to `src/lib/validation.test.ts`.
4. Create `src/app/(main)/messages/actions.ts` (`sendMessage`, `getUnreadMessageCount`, `getConversations`, `getThread`, `markThreadRead`) with the exact guards + SQL + `revalidatePath` targets above.
5. Create `src/components/MessageComposer.tsx`, `src/components/MessagesAck.tsx`, `src/components/MessageRow.tsx`.
6. Create `src/app/(main)/messages/page.tsx` + `src/app/(main)/messages/loading.tsx`.
7. Create `src/app/(main)/messages/[username]/page.tsx` + `src/app/(main)/messages/[username]/loading.tsx` (with `notFound()` + self-thread `redirect("/messages")`).
8. Wire `SiteHeader.tsx`: import + call `getUnreadMessageCount`, add the navy-badged `messages` link to BOTH navs.
9. Add the `Message` Link to the profile Connection panel in `profile/[username]/page.tsx`.
10. (Optional) Add `MESSAGES` seed const + insert loop + `messages` count to `src/app/api/seed/route.ts`.
11. Run `npx tsc --noEmit` and `npm test` (QA gate) — confirm `validateMessage` tests pass and types compile. Verify no `pg`/`bcrypt` leaked into `auth.config.ts`/`middleware.ts`.
12. Deploy → `curl -X POST ".../api/migrate?token=$NEXTAUTH_SECRET"` (then `/api/seed` if seeded). Smoke-test the demo loop.
