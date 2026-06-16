// Shared Tailwind class strings for buttons and form fields. Single source of
// truth so padding, radius, hover, disabled, and focus states match everywhere
// (extracted from the byte-identical classNames previously inlined across the
// interactive components). Class strings only — no JSX, no "use client".
//
// Hovers use real color shifts (not opacity), and every variant carries a
// visible focus ring for a11y.

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container"

export const buttonClass = {
  // Filled brand button (forms, primary CTAs).
  primary: `shrink-0 rounded bg-primary px-4 py-1.5 text-label-bold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 ${focusRing}`,
  // Bordered button for compact list-row actions (Follow/Poke).
  outline: `shrink-0 rounded border border-primary px-3 py-1 text-label-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-50 ${focusRing}`,
  // Borderless text button for low-emphasis actions.
  ghost: `shrink-0 rounded px-3 py-1 text-label-bold text-primary transition-colors hover:bg-surface-container disabled:opacity-50 ${focusRing}`,
} as const

export const fieldClass = `w-full rounded border border-outline-variant bg-white p-2 text-body-base text-on-surface placeholder:text-outline transition-colors focus:border-primary ${focusRing}`
