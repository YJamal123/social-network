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

CREATE TABLE IF NOT EXISTS wall_posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) <= 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wall_posts_owner_id_idx ON wall_posts(owner_id);

CREATE TABLE IF NOT EXISTS pokes (
  poker_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pokee_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN     NOT NULL DEFAULT false,
  PRIMARY KEY (poker_id, pokee_id)
);

CREATE INDEX IF NOT EXISTS pokes_pokee_id_idx ON pokes(pokee_id);

CREATE TABLE IF NOT EXISTS taunts (
  taunter_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tauntee_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN     NOT NULL DEFAULT false,
  PRIMARY KEY (taunter_id, tauntee_id)
);

CREATE INDEX IF NOT EXISTS taunts_tauntee_id_idx ON taunts(tauntee_id);

CREATE TABLE IF NOT EXISTS relationships (
  requester_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL,
  confirmed    BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS relationships_addressee_id_idx ON relationships(addressee_id);

CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL CHECK (char_length(content) <= 280),
  read         BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS messages_recipient_id_idx ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS courses TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interested_in TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS looking_for TEXT;
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
