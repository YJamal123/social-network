import type { ReactNode } from "react"

// The fundamental layout unit of the design system: a white surface with a 1px
// hairline border + soft shadow, topped by a periwinkle header bar with white
// bold text and optional bracketed action(s) on the right.
export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-panel-padding",
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={`overflow-hidden border border-outline-variant bg-surface-container-lowest shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant bg-periwinkle px-panel-padding py-1.5">
        <h2 className="text-section-header text-white">{title}</h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
