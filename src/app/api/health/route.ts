import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET() {
  try {
    await query("SELECT 1")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Health check failed:", err)
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 500 })
  }
}
