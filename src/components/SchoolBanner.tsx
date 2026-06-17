import { SCHOOL_META, type School } from "@/lib/schools"

// Per-school campus banner — a wide photo strip that sits BELOW the navy
// SiteHeader and ABOVE the feed grid. Driven entirely by the viewer's `school`
// via the static SCHOOL_META map (full /banners/*.jpg paths, never interpolated
// class names). Layering, from back to front:
//   1. a solid carnelian fallback block (all-CSS) — shows through if the photo
//      is ever missing or fails to load, so the banner always degrades to a
//      tasteful colored strip with the wordmark still legible;
//   2. the campus photo (object-cover, center-cropped to keep the landmark);
//   3. a dark scrim gradient so white text stays readable over any photo;
//   4. the wordmark + tagline.
// Server component. Tailwind only, no inline style, no raw hex.
export function SchoolBanner({ school }: { school: School }) {
  const { name, tagline, banner } = SCHOOL_META[school]

  return (
    <div className="relative h-32 w-full overflow-hidden border-b-2 border-carnelian-dark bg-carnelian text-on-carnelian sm:h-40">
      {/* Photo layer — object-cover keeps the iconic landmark centred. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner}
        alt={`${name} campus`}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* Legibility scrim — darker at the bottom where the text sits. */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10"
        aria-hidden
      />

      <div className="relative mx-auto flex h-full max-w-container-max items-end gap-gutter px-gutter pb-stack-lg">
        <div className="flex min-w-0 flex-col gap-stack-sm sm:flex-row sm:items-baseline sm:gap-3">
          <span className="text-title-lg font-bold tracking-wide drop-shadow">
            {name}
          </span>
          <span className="truncate text-body-sm text-on-carnelian/90 drop-shadow">
            {tagline}
          </span>
        </div>
      </div>
    </div>
  )
}
