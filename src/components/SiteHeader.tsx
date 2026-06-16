import Link from "next/link"
import { auth, signOut } from "@/lib/auth"

// Shared top bar for all (main) routes. Server component so it can read the
// session and host the sign-out Server Action inline.
export async function SiteHeader() {
  const session = await auth()
  const username = session?.user?.name

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
