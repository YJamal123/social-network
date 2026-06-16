// Cornell school banner — a slim Carnelian strip intended to sit BELOW the navy
// SiteHeader and ABOVE the feed grid. Original creative only: the shield crest
// is a hand-authored inline SVG (NOT the trademarked Cornell seal), all color
// comes from the carnelian tokens, and a faint diagonal-hatch pattern adds
// period texture. No raster images, no inline style, no raw hex.
export function SchoolBanner() {
  return (
    <div className="relative w-full overflow-hidden border-b-2 border-carnelian-dark bg-carnelian text-on-carnelian">
      {/* Faint period texture — diagonal hatch at low opacity */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-on-carnelian opacity-[0.06]"
        aria-hidden
      >
        <defs>
          <pattern
            id="school-banner-hatch"
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#school-banner-hatch)" />
      </svg>

      <div className="relative mx-auto flex max-w-container-max items-center gap-gutter px-gutter py-stack-md">
        {/* Original shield crest — rounded-top, pointed-bottom, chevron + serif C */}
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          className="shrink-0"
          aria-hidden
        >
          <path
            d="M4 6 a4 4 0 0 1 4 -4 h20 a4 4 0 0 1 4 4 v15 c0 7 -6 11 -14 13 c-8 -2 -14 -6 -14 -13 Z"
            className="fill-on-carnelian"
          />
          <path d="M8 20 L18 14 L28 20 L18 16 Z" className="fill-carnelian" />
          <text
            x="18"
            y="14"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize="13"
            className="fill-carnelian"
          >
            C
          </text>
        </svg>

        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-bold tracking-wide">CORNELL UNIVERSITY</span>
          <span className="h-3 w-px bg-on-carnelian/40" aria-hidden />
          <span className="truncate text-body-sm text-on-carnelian/80">
            Ithaca, NY · Class network · Est. 1865
          </span>
        </div>

        <div className="ml-auto hidden shrink-0 sm:block">
          <span className="rounded bg-on-carnelian/10 px-2 py-0.5 text-body-sm">
            Big Red
          </span>
        </div>
      </div>
    </div>
  )
}
