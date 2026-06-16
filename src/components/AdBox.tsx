import type { ReactNode } from "react"

// Boxy 2004-style sidebar ad unit. A quiet "SPONSORED" eyebrow on a carnelian
// tint, then a free-form body. School/ad chrome only — carnelian tokens are
// scoped here and to the SchoolBanner; never coral (like/poke) or navy
// (app palette). No raster images, no inline style, no raw hex.
export function AdBox({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded border border-outline-variant bg-surface-container-lowest">
      <div className="bg-carnelian-tint px-2 py-0.5 text-caption font-bold text-carnelian">
        SPONSORED
      </div>
      <div className="p-panel-padding">{children}</div>
    </div>
  )
}
