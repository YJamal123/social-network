import Link from "next/link"
import { Panel } from "@/components/Panel"
import { buttonClass } from "@/lib/ui"

// Root-level 404. profile/[username]/page.tsx calls notFound() for unknown
// users; without this boundary Next renders its default unstyled page. This is
// a server component (no interactivity) on the plain root layout, so it carries
// the [ sml ] wordmark itself to stay on-brand.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-stack-lg px-gutter py-stack-lg">
      <Link href="/feed" className="text-masthead-logo text-primary">
        [ sml ]
      </Link>
      <Panel title="Page not found" className="w-full">
        <div className="flex flex-col gap-stack-md">
          <p className="text-title-lg text-on-surface">404</p>
          <p className="text-body-base text-on-surface-variant">
            We couldn&apos;t find the page you were looking for. It may have been
            moved, or the user may not exist.
          </p>
          <div>
            <Link href="/feed" className={`inline-block ${buttonClass.primary}`}>
              Back to feed
            </Link>
          </div>
        </div>
      </Panel>
    </main>
  )
}
