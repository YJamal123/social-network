import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { query } from "@/lib/db"
import { ProfileEditForm } from "@/components/ProfileEditForm"
import { AvatarUpload } from "@/components/AvatarUpload"

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

  const result = await query<{
    bio: string | null
    relationship_status: string | null
    interests: string | null
    courses: string | null
    school: string | null
    interested_in: string | null
    looking_for: string | null
    class_year: number | null
  }>(
    "SELECT bio, relationship_status, interests, courses, school, interested_in, looking_for, class_year FROM users WHERE id = $1",
    [session.user.id]
  )
  const row = result.rows[0]

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-gutter p-6">
      <AvatarUpload userId={session.user.id} username={params.username} />
      <ProfileEditForm
        username={params.username}
        initialBio={row?.bio ?? ""}
        initialRelationshipStatus={row?.relationship_status ?? ""}
        initialInterests={row?.interests ?? ""}
        initialCourses={row?.courses ?? ""}
        initialSchool={row?.school ?? ""}
        initialInterestedIn={row?.interested_in ?? ""}
        initialLookingFor={row?.looking_for ?? ""}
        initialClassYear={row?.class_year ?? null}
      />
    </main>
  )
}
