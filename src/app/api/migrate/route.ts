import { NextResponse } from "next/server"
import { query } from "@/lib/db"

// One-shot, idempotent schema migration. The Cloud SQL instance is private-IP
// only, so it can't be reached from a laptop — this runs from inside the VPC
// (on Cloud Run) instead. Hit it once after the first deploy:
//   curl -X POST "https://<url>/api/migrate?token=<NEXTAUTH_SECRET>"
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        UNIQUE NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  bio           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) <= 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_user_id_idx    ON posts(user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx ON follows(following_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS likes_post_id_idx ON likes(post_id);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) <= 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);
`

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!process.env.NEXTAUTH_SECRET || token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await query(SCHEMA)
    return NextResponse.json({ ok: true, message: "Schema applied" })
  } catch (err) {
    console.error("Migration failed:", err)
    return NextResponse.json({ ok: false, error: "Migration failed" }, { status: 500 })
  }
}
