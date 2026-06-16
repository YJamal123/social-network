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
                <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-body-sm font-bold text-white">
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
            placeholder="Search…"
            className="w-28 border-none bg-transparent text-body-sm text-on-primary placeholder:text-on-primary/60 focus:outline-none focus:ring-0"
          />
        </form>
      </div>
    </header>
  )
}
