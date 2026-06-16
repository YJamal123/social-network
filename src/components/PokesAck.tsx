"use client"

import { useEffect } from "react"
import { acknowledgePokes } from "@/app/(main)/pokes/actions"

// Fires once on mount to mark the viewer's pokes as acknowledged, which clears
// the SiteHeader indicator. Renders nothing.
export function PokesAck() {
  useEffect(() => {
    void acknowledgePokes()
  }, [])
  return null
}
