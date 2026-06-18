import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPrisma } from "@/lib/db"
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

  const row = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: {
      bio: true,
      relationshipStatus: true,
      interests: true,
      courses: true,
      school: true,
      interestedIn: true,
      lookingFor: true,
      classYear: true,
    },
  })

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-gutter p-6">
      <AvatarUpload userId={session.user.id} username={params.username} />
      <ProfileEditForm
        username={params.username}
        initialBio={row?.bio ?? ""}
        initialRelationshipStatus={row?.relationshipStatus ?? ""}
        initialInterests={row?.interests ?? ""}
        initialCourses={row?.courses ?? ""}
        initialSchool={row?.school ?? ""}
        initialInterestedIn={row?.interestedIn ?? ""}
        initialLookingFor={row?.lookingFor ?? ""}
        initialClassYear={row?.classYear ?? null}
      />
    </main>
  )
}
