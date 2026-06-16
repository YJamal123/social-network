import { SiteHeader } from "@/components/SiteHeader"

// Wraps every authenticated (main) route with the shared header.
export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
