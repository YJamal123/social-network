"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { fieldClass } from "@/lib/ui"
import { SCHOOLS } from "@/lib/schools"
import { CLASS_YEARS } from "@/lib/classYears"
import type { DirectoryFilters } from "@/lib/types"

const labelClass = "block text-label-bold text-secondary"

export function DirectorySearch({
  initialFilters,
}: {
  initialFilters: DirectoryFilters
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialFilters.q)
  const [school, setSchool] = useState(initialFilters.school)
  const [year, setYear] = useState(
    initialFilters.year ? String(initialFilters.year) : ""
  )
  const [course, setCourse] = useState(initialFilters.course)
  const [interest, setInterest] = useState(initialFilters.interest)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    const add = (key: string, value: string) => {
      const trimmed = value.trim()
      if (trimmed) params.set(key, trimmed)
    }
    add("q", q)
    add("school", school)
    add("year", year)
    add("course", course)
    add("interest", interest)
    const qs = params.toString()
    router.push(qs ? `/directory?${qs}` : "/directory")
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
      <input
        type="text"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name…"
        className={fieldClass}
      />
      <div className="grid grid-cols-1 gap-stack-md sm:grid-cols-2">
        <label className={labelClass}>
          School
          <select
            name="school"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Any school</option>
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Class year
          <select
            name="year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={`${fieldClass} mt-1`}
          >
            <option value="">Any year</option>
            {CLASS_YEARS.map((y) => (
              <option key={y} value={y}>
                Class of {y}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Course
          <input
            type="text"
            name="course"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="e.g. CS161"
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className={labelClass}>
          Interest
          <input
            type="text"
            name="interest"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            placeholder="e.g. rowing"
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>
      <button
        type="submit"
        className="self-start shrink-0 rounded bg-primary px-6 py-2 text-label-bold text-on-primary transition-opacity hover:opacity-90"
      >
        Search
      </button>
    </form>
  )
}
