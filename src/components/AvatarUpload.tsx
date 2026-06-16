"use client"

import { useFormState } from "react-dom"
import { uploadAvatar } from "@/app/(main)/profile/actions"
import { Avatar } from "@/components/Avatar"
import { Panel } from "@/components/Panel"
import { buttonClass } from "@/lib/ui"

export function AvatarUpload({
  userId,
  username,
}: {
  userId: string
  username: string
}) {
  const [state, formAction] = useFormState(uploadAvatar, {})

  return (
    <Panel title="Profile Picture">
      <form action={formAction} className="flex items-center gap-4">
        <Avatar userId={userId} username={username} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {state.error && <p className="text-body-sm text-error">{state.error}</p>}
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            className="text-body-sm file:mr-3 file:rounded file:border-0 file:bg-secondary-container file:px-3 file:py-1 file:text-label-bold file:text-on-secondary-container"
          />
          <button type="submit" className={`${buttonClass.primary} self-start`}>
            Upload
          </button>
          <p className="text-caption text-outline">JPEG, PNG, WebP, or GIF · up to 2MB</p>
        </div>
      </form>
    </Panel>
  )
}
