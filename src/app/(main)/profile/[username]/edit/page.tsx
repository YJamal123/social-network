import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { ProfileEditForm } from "@/components/ProfileEditForm"

export default async function EditProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const session = await auth()
  // Only the owner may edit; bounce everyone else to the public profile.
  if (!session?.user?.name || session.user.name !== params.username) {
    redirect(`/profile/${params.username}`)
  }

  const result = await query<{ bio: string | null }>(
    "SELECT bio FROM users WHERE id = $1",
    [session.user.id]
  )
  const bio = result.rows[0]?.bio ?? ""

  return (
    <main className="mx-auto max-w-2xl p-6">
      <ProfileEditForm username={params.username} initialBio={bio} />
    </main>
  )
}
