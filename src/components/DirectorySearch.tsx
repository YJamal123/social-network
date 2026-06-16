"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { fieldClass } from "@/lib/ui"

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
        className={fieldClass}
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
