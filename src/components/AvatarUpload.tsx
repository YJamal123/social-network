"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { uploadAvatar } from "@/app/(main)/profile/actions"
import { Panel } from "@/components/Panel"
import { buttonClass } from "@/lib/ui"

export function AvatarUpload({
  userId,
  username,
}: {
  userId: string
  username: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Cache-bust the preview so a freshly uploaded image shows immediately.
  const [version, setVersion] = useState(0)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    const file = formData.get("avatar")
    if (!(file instanceof File) || file.size === 0) {
      setError("Please choose an image first")
      return
    }
    startTransition(async () => {
      const result = await uploadAvatar(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      setVersion((v) => v + 1)
      formRef.current?.reset()
      router.refresh()
    })
  }

  return (
    <Panel title="Profile Picture">
      <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- route-served avatar */}
        <img
          src={`/api/avatar/${userId}?v=${version}`}
          alt={username}
          className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {error && <p className="text-body-sm text-error">{error}</p>}
          {saved && !pending && (
            <p className="text-body-sm text-secondary">Saved ✓</p>
          )}
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            className="text-body-sm file:mr-3 file:rounded file:border-0 file:bg-secondary-container file:px-3 file:py-1 file:text-label-bold file:text-on-secondary-container"
          />
          <button
            type="submit"
            disabled={pending}
            className={`${buttonClass.primary} self-start`}
          >
            {pending ? "Uploading…" : "Upload"}
          </button>
          <p className="text-caption text-outline">JPEG, PNG, WebP, or GIF · up to 2MB</p>
        </div>
      </form>
    </Panel>
  )
}
