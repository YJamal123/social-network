import type { ReactNode } from "react"

// Reusable server-safe accordion unit built on native <details>/<summary>:
// expandable in-page sections with zero client JS, keyboard/AT accessible by
// default. The summary carries a periwinkle-tinted glyph (app chrome — NOT
// carnelian) so it harmonizes with the Panel header tick. The default
// disclosure triangle is hidden; an expand_more chevron rotates on open.
export function AccordionSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      className="group border-b border-outline-variant/60 last:border-0"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-panel-padding py-2 text-section-header text-on-surface [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-base text-periwinkle">
          {icon}
        </span>
        {title}
        <span className="material-symbols-outlined ml-auto text-base text-outline transition-transform group-open:rotate-180">
          expand_more
        </span>
      </summary>
      <div className="px-panel-padding pb-2">{children}</div>
    </details>
  )
}
