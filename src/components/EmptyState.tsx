import type { ReactNode } from "react"

export function EmptyState({
  icon,
  message,
  children,
}: {
  icon?: string
  message: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-stack-md p-12 text-center">
      {icon && (
        <span className="material-symbols-outlined text-4xl text-outline-variant">
          {icon}
        </span>
      )}
      <p className="text-label-bold text-secondary">{message}</p>
      {children}
    </div>
  )
}
