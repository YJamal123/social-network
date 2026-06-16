"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function DirectorySearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = q.trim()
    router.push(trimmed ? `/directory?q=${encodeURIComponent(trimmed)}` : "/directory")
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-stack-md">
      <input
        type="text"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, major, or interest…"
        className="w-full rounded border border-outline-variant bg-white px-3 py-2 text-body-base text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded bg-primary px-6 py-2 text-label-bold text-on-primary transition-opacity hover:opacity-90"
      >
        Search
      </button>
    </form>
  )
}
