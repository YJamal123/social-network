import { query } from "@/lib/db"

// Serves a user's avatar: the uploaded image if present, otherwise a generated
// initials SVG so every Avatar can be a plain <img> with no per-call branching.
function initialsSvg(letter: string): string {
  const safe = letter.replace(/[<>&"']/g, "")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" fill="#3b5998"/>
  <text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#ffffff"
        font-family="'Libre Franklin', Arial, sans-serif" font-size="48" font-weight="700">${safe}</text>
</svg>`
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query<{
      avatar: Buffer | null
      avatar_mime: string | null
      username: string
    }>("SELECT avatar, avatar_mime, username FROM users WHERE id = $1", [
      params.id,
    ])
    const row = result.rows[0]

    if (row?.avatar && row.avatar_mime) {
      return new Response(new Uint8Array(row.avatar), {
        headers: {
          "Content-Type": row.avatar_mime,
          // Short cache so a freshly uploaded avatar shows up quickly.
          "Cache-Control": "private, max-age=10, must-revalidate",
        },
      })
    }

    const letter = (row?.username ?? "?").charAt(0).toUpperCase()
    return new Response(initialsSvg(letter), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60",
      },
    })
  } catch (err) {
    console.error("Avatar fetch failed:", err)
    return new Response(initialsSvg("?"), {
      headers: { "Content-Type": "image/svg+xml" },
    })
  }
}
