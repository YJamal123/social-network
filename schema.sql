-- Apply once against your Cloud SQL PostgreSQL instance before first deploy.
-- Run via Cloud SQL Auth Proxy: psql $DATABASE_URL -f schema.sql

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

CREATE INDEX IF NOT EXISTS posts_user_id_idx     ON posts(user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx  ON posts(created_at DESC);

-- Stretch goals (uncomment when implementing)
-- CREATE TABLE IF NOT EXISTS follows (
--   follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
--   PRIMARY KEY (follower_id, following_id)
-- );
--
-- CREATE TABLE IF NOT EXISTS likes (
--   user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   PRIMARY KEY (user_id, post_id)
-- );
--
-- CREATE TABLE IF NOT EXISTS comments (
--   id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--   post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
--   user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   content    TEXT        NOT NULL CHECK (char_length(content) <= 500),
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
