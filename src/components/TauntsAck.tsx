"use client"

import { useEffect } from "react"
import { acknowledgeTaunts } from "@/app/(main)/taunts/actions"

// Fires once on mount to mark the viewer's taunts as acknowledged, which clears
// the SiteHeader indicator. Renders nothing.
export function TauntsAck() {
  useEffect(() => {
    void acknowledgeTaunts()
  }, [])
  return null
}
