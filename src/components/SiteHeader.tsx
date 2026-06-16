import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { getUnacknowledgedPokeCount } from "@/app/(main)/pokes/actions"

// Masthead for all (main) routes: solid navy bar, bracketed [ sml ] wordmark,
// dot-separated text nav, coral poke indicator, and a quick-search box that
// submits to the directory. Server component (reads session + poke count).
export async function SiteHeader() {
  const session = await auth()
  const username = session?.user?.name
  const pokeCount = username ? await getUnacknowledgedPokeCount() : 0

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
              href="/pokes"
              className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
            >
              pokes
              {pokeCount > 0 && (
                <span
                  aria-label={`${pokeCount} new pokes`}
                  aria-live="polite"
                  className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
                >
                  {pokeCount}
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
            className="w-28 border-none bg-transparent text-body-sm text-on-primary placeholder:text-on-primary/60"
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
          href="/pokes"
          className="flex items-center gap-1 opacity-90 hover:underline hover:opacity-100"
        >
          pokes
          {pokeCount > 0 && (
            <span
              aria-label={`${pokeCount} new pokes`}
              aria-live="polite"
              className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white"
            >
              {pokeCount}
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
