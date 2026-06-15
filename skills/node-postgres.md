# Raw SQL with node-postgres (pg)

## Install

```bash
npm install pg
npm install -D @types/pg
```

## DB Singleton (`src/lib/db.ts`)

Cloud Run starts multiple instances — one Pool per process is correct. The Unix socket path is used when connecting via the Cloud SQL Auth Proxy (set via `--add-cloudsql-instances` on Cloud Run).

```ts
// src/lib/db.ts
import { Pool } from "pg"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,           // Cloud Run instances are memory-constrained; keep small
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function query<T = any>(
  text: string,
  params?: unknown[]
): Promise<import("pg").QueryResult<T>> {
  const client = await pool.connect()
  try {
    return await client.query<T>(text, params)
  } finally {
    client.release()
  }
}

export default pool
```

## Connection String Formats

```bash
# Cloud Run → Cloud SQL via Unix socket (Auth Proxy, private IP)
DATABASE_URL=postgresql://app_user:password@/social_network?host=/cloudsql/sml-interview-sandbox:us-central1:mdjamal-db

# Local dev via Cloud SQL Auth Proxy (proxy listens on localhost:5432)
DATABASE_URL=postgresql://app_user:password@localhost:5432/social_network

# Local dev direct (if running Postgres locally)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/social_network
```

**The Unix socket format** (`?host=/cloudsql/...`) is what Cloud Run uses at runtime. Never put this in the repo — it lives in Secret Manager as `mdjamal-db-url`.

## Common Query Patterns

```ts
// Single row
const result = await query<User>(
  "SELECT * FROM users WHERE username = $1",
  [username]
)
const user = result.rows[0] ?? null  // null if not found

// Multiple rows
const result = await query<Post>(
  "SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT $1",
  [50]
)
const posts = result.rows

// Insert and return
const result = await query<{ id: string }>(
  "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
  [username, email, hashedPassword]
)
const newId = result.rows[0].id

// Upsert (likes toggle — insert or delete)
await query(
  "INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
  [userId, postId]
)

// Delete with existence check
const result = await query(
  "DELETE FROM likes WHERE user_id=$1 AND post_id=$2 RETURNING post_id",
  [userId, postId]
)
const wasLiked = result.rowCount > 0
```

## Transactions

```ts
import pool from "@/lib/db"

const client = await pool.connect()
try {
  await client.query("BEGIN")
  await client.query("INSERT INTO users (...) VALUES (...)", [...])
  await client.query("INSERT INTO follows (...) VALUES (...)", [...])
  await client.query("COMMIT")
} catch (err) {
  await client.query("ROLLBACK")
  throw err
} finally {
  client.release()
}
```

## Parameterized Queries — Always Use `$1, $2, ...`

```ts
// ✅ Safe — parameterized
await query("SELECT * FROM users WHERE email = $1", [email])

// ❌ Never do this — SQL injection
await query(`SELECT * FROM users WHERE email = '${email}'`)
```

## Password Hashing

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

```ts
import bcrypt from "bcryptjs"

// On register
const passwordHash = await bcrypt.hash(password, 12)
await query("INSERT INTO users (password_hash, ...) VALUES ($1, ...)", [passwordHash, ...])

// On login
const user = await getByEmail(email)
const valid = await bcrypt.compare(password, user.password_hash)
```

## Gotchas

- **`pg` uses `$1` not `?`** — different from mysql2/sqlite.
- **UUID columns come back as strings** from `pg` — don't parse them.
- **`TIMESTAMPTZ` comes back as a JS `Date` object** — call `.toISOString()` before returning in JSON.
- **Pool size on Cloud Run:** Each Cloud Run container gets its own pool. With concurrency=80 (default) and many instances, you can exhaust Cloud SQL connections fast. Keep `max: 5` and set `--max-instances` on Cloud Run.
- **Don't use `pool.query()` directly** — use the `query()` wrapper which acquires and releases the client, preventing connection leaks.
- **`rowCount` can be `null`** on SELECT queries — only trust it after INSERT/UPDATE/DELETE.
