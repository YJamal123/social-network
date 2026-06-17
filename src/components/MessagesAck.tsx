"use client"

import { useEffect } from "react"
import { markThreadRead } from "@/app/(main)/messages/actions"

// Fires once on mount to mark this conversation's incoming messages as read,
// which clears the SiteHeader indicator. Renders nothing.
export function MessagesAck({ partnerId }: { partnerId: string }) {
  useEffect(() => {
    void markThreadRead(partnerId)
  }, [partnerId])
  return null
}
