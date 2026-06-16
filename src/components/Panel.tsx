import type { ReactNode } from "react"

// The fundamental layout unit of the design system. Calm treatment: a single
// separation signal (soft shadow on a white, rounded card — no loud border),
// and a quiet in-card header (dark text on white with a thin rule + a small
// periwinkle accent tick) instead of a solid colored bar.
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
      className={`overflow-hidden rounded-lg bg-surface-container-lowest shadow ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/60 px-panel-padding py-2">
        <h2 className="flex items-center gap-2 text-section-header text-on-surface">
          <span className="h-3.5 w-1 rounded-full bg-periwinkle" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
