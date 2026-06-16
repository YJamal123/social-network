import Link from "next/link"
import { auth, signOut } from "@/lib/auth"
import { getUnacknowledgedPokeCount } from "@/app/(main)/pokes/actions"

// Shared top bar for all (main) routes. Server component so it can read the
// session and host the sign-out Server Action inline.
export async function SiteHeader() {
  const session = await auth()
  const username = session?.user?.name
  const pokeCount = username ? await getUnacknowledgedPokeCount() : 0

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between p-4">
        <Link href="/feed" className="text-lg font-bold">
          SML
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Link href="/directory" className="hover:underline">
            Directory
          </Link>
          {username && (
            <Link href="/pokes" className="flex items-center gap-1 hover:underline">
              Pokes
              {pokeCount > 0 && (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                  {pokeCount}
                </span>
              )}
            </Link>
          )}
          {username && (
            <Link href={`/profile/${username}`} className="hover:underline">
              {username}
            </Link>
          )}
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button className="hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  )
}
