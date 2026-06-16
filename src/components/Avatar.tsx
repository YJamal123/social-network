const SIZES = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "aspect-square w-full",
} as const

// Renders the user's avatar via the /api/avatar/[id] route, which returns the
// uploaded image or a generated initials SVG fallback — so callers only need a
// userId and never branch on "has a photo".
export function Avatar({
  userId,
  username,
  size = "md",
}: {
  userId: string
  username: string
  size?: keyof typeof SIZES
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic route-served image, not a static asset
    <img
      src={`/api/avatar/${userId}`}
      alt={username}
      className={`shrink-0 rounded-lg object-cover ring-1 ring-black/5 ${SIZES[size]}`}
    />
  )
}
