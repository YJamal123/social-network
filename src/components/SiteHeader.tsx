import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { getUnacknowledgedPokeCount } from "@/app/(main)/pokes/actions"
import { getUnacknowledgedTauntCount } from "@/app/(main)/taunts/actions"
import { getPendingRelationshipRequestCount } from "@/app/(main)/profile/actions"
import { getPendingFriendRequestCount } from "@/app/(main)/friends/actions"
import { getUnreadMessageCount } from "@/app/(main)/messages/actions"

// Masthead for all (main) routes: solid navy bar, bracketed [ sml ] wordmark,
// dot-separated text nav, coral poke indicator, and a quick-search box that
// submits to the directory. Server component (reads session + poke count).
export async function SiteHeader() {
  const session = await auth()
  const username = session?.user?.name
  const pokeCount = username ? await getUnacknowledgedPokeCount() : 0
  const tauntCount = username ? await getUnacknowledgedTauntCount() : 0
  const relationshipCount = username
    ? await getPendingRelationshipRequestCount()
    : 0
  const friendCount = username ? await getPendingFriendRequestCount() : 0
  const messageCount = username ? await getUnreadMessageCount() : 0

  return (
    <header className="sticky top-0 z-50 w-full border-b border-outline-variant bg-primary">
      <div className="mx-auto flex h-12 max-w-container-max items-center justify-between gap-4 px-gutter">
        <div className="flex items-center gap-6">
          <Link href="/feed" className="text-masthead-logo text-on-primary">
            [ sml ]
          </Link>
          <nav className="hidden items-center gap-3 text-body-base text-on-primary md:flex">
            <Link href="/feed" className="font-bold hover:underline">
              home
            </Link>
            <span className="opacity-50">·</span>
            <Link href="/directory" className="opacity-90 hover:underline hover:opacity-100">
              directory
            </Link>
            <span className="opacity-50">·</span>
            <Link
              href="/friends"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              friends
              {friendCount > 0 && (
                <span
                  aria-label={`${friendCount} pending friend requests`}
                  aria-live="polite"
                  className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
                >
                  {friendCount}
                </span>
              )}
            </Link>
            <span className="opacity-50">·</span>
            <Link
              href="/pokes"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              pokes
              {pokeCount > 0 && (
                <span
                  aria-label={`${pokeCount} new pokes`}
                  aria-live="polite"
                  className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
                >
                  {pokeCount}
                </span>
              )}
            </Link>
            <span className="opacity-50">·</span>
            <Link
              href="/taunts"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              taunts
              {tauntCount > 0 && (
                <span
                  aria-label={`${tauntCount} new taunts`}
                  aria-live="polite"
                  className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
                >
                  {tauntCount}
                </span>
              )}
            </Link>
            <span className="opacity-50">·</span>
            <Link
              href="/relationships"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              relationships
              {relationshipCount > 0 && (
                <span
                  aria-label={`${relationshipCount} pending relationship requests`}
                  aria-live="polite"
                  className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
                >
                  {relationshipCount}
                </span>
              )}
            </Link>
            <span className="opacity-50">·</span>
            <Link
              href="/messages"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              messages
              {messageCount > 0 && (
                <span
                  aria-label={`${messageCount} unread messages`}
                  aria-live="polite"
                  className="inline-flex min-w-badge items-center justify-center rounded-full bg-primary px-1 text-body-sm font-bold text-on-primary ring-1 ring-on-primary/40"
                >
                  {messageCount}
                </span>
              )}
            </Link>
            {username && (
              <>
                <span className="opacity-50">·</span>
                <Link
                  href={`/profile/${username}`}
                  className="opacity-90 hover:underline hover:opacity-100"
                >
                  profile
                </Link>
              </>
            )}
            <span className="opacity-50">·</span>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button className="opacity-90 hover:underline hover:opacity-100">logout</button>
            </form>
          </nav>
        </div>
        <form
          action="/directory"
          className="flex items-center gap-1 rounded bg-white/10 px-2 py-1"
        >
          <span className="material-symbols-outlined text-on-primary">search</span>
          <input
            name="q"
            aria-label="Search people"
            placeholder="Search…"
            className="w-search border-none bg-transparent text-body-sm text-on-primary placeholder:text-on-primary/60"
          />
        </form>
      </div>
      {/* Mobile nav fallback: the primary nav is hidden under md, so surface the
          same links in a scrollable row on small screens. */}
      <nav className="flex items-center gap-4 overflow-x-auto border-t border-white/10 px-gutter py-2 text-body-base text-on-primary md:hidden">
        <Link href="/feed" className="font-bold hover:underline">
          home
        </Link>
        <Link href="/directory" className="opacity-90 hover:underline hover:opacity-100">
          directory
        </Link>
        <Link
          href="/friends"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          friends
          {friendCount > 0 && (
            <span
              aria-label={`${friendCount} pending friend requests`}
              aria-live="polite"
              className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
            >
              {friendCount}
            </span>
          )}
        </Link>
        <Link
          href="/pokes"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          pokes
          {pokeCount > 0 && (
            <span
              aria-label={`${pokeCount} new pokes`}
              aria-live="polite"
              className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
            >
              {pokeCount}
            </span>
          )}
        </Link>
        <Link
          href="/taunts"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          taunts
          {tauntCount > 0 && (
            <span
              aria-label={`${tauntCount} new taunts`}
              aria-live="polite"
              className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
            >
              {tauntCount}
            </span>
          )}
        </Link>
        <Link
          href="/relationships"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          relationships
          {relationshipCount > 0 && (
            <span
              aria-label={`${relationshipCount} pending relationship requests`}
              aria-live="polite"
              className="inline-flex min-w-badge items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
            >
              {relationshipCount}
            </span>
          )}
        </Link>
        <Link
          href="/messages"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          messages
          {messageCount > 0 && (
            <span
              aria-label={`${messageCount} unread messages`}
              aria-live="polite"
              className="inline-flex min-w-badge items-center justify-center rounded-full bg-primary px-1 text-body-sm font-bold text-on-primary ring-1 ring-on-primary/40"
            >
              {messageCount}
            </span>
          )}
        </Link>
        {username && (
          <Link
            href={`/profile/${username}`}
            className="opacity-90 hover:underline hover:opacity-100"
          >
            profile
          </Link>
        )}
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button className="opacity-90 hover:underline hover:opacity-100">logout</button>
        </form>
      </nav>
    </header>
  )
}
