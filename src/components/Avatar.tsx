const SIZES = {
  sm: "h-10 w-10 text-base",
  md: "h-12 w-12 text-lg",
  lg: "h-16 w-16 text-2xl",
  xl: "aspect-square w-full text-6xl",
} as const

export function Avatar({
  username,
  size = "md",
}: {
  username: string
  size?: keyof typeof SIZES
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-primary-container font-bold text-white ring-1 ring-black/5 ${SIZES[size]}`}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  )
}
