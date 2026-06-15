import { auth, signOut } from "@/lib/auth"
import { PostForm } from "@/components/PostForm"

// Post composer is live (Phase 3). The post list lands in Phase 4.
export default async function FeedPage() {
  const session = await auth()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feed</h1>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button className="text-sm text-gray-500 hover:underline">Sign out</button>
        </form>
      </div>

      <PostForm />

      <p className="text-gray-600">
        Signed in as <strong>{session?.user?.name}</strong>. Post list coming in Phase 4.
      </p>
    </main>
  )
}
