import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import getPool from "@/lib/db"

// One-shot, idempotent demo-data seeder. Mirrors /api/migrate: token-guarded and
// run from inside the VPC (Cloud SQL is private-IP only, unreachable from a laptop).
// Re-runnable — it first deletes every demo account (email LIKE '%@demo.sml') and
// the ON DELETE CASCADE wipes their posts/follows/likes/comments, then reinserts.
// Run once after deploy:
//   curl -X POST "https://<url>/api/seed?token=$NEXTAUTH_SECRET"
//
// All demo accounts share the password: demo1234

const DEMO_PASSWORD = "demo1234"

interface DemoUser {
  username: string
  bio: string
}

// ~9 users with characterful early-Facebook-era bios.
const USERS: DemoUser[] = [
  { username: "thefacebook_tom", bio: "CS junior. Building things in my dorm. Poke me." },
  { username: "harvardhannah", bio: "Pre-med, perpetually in Lamont Library. Coffee is a food group." },
  { username: "djmarcus", bio: "Spinning records at the eating club this Friday. RSVP or regret it." },
  { username: "priya_codes", bio: "EE/CS double major. Soldering > sleeping." },
  { username: "skater_dave", bio: "Econ major who would rather be at the skatepark." },
  { username: "artsy_lena", bio: "Visual arts. I will draw you for ramen money." },
  { username: "coachrandy", bio: "Intramural soccer captain. Practice is NOT optional." },
  { username: "bookish_mei", bio: "English lit. Currently 4 novels deep, 0 essays written." },
  { username: "gamer_greg", bio: "Halo LAN party in my common room. BYO controller." },
]

// Posts keyed by author index. Kept under 280 chars, 2004 status-update vibe.
const POSTS: Record<number, string[]> = {
  0: [
    "Just pushed the new directory live. Add your friends!",
    "Pulled an all-nighter on the database. Worth it.",
    "Who else is procrastinating on the problem set?",
    "Note to self: do not deploy on a Friday.",
    "Thefacebook is officially more popular than my actual classes.",
  ],
  1: [
    "Organic chem exam in 3 days. Send caffeine.",
    "Found a study room on the 4th floor nobody knows about. Don't tell anyone.",
    "Cafeteria has the good cookies today. This is a public service announcement.",
    "Cried over a titration. It's fine. I'm fine.",
  ],
  2: [
    "Set list for Friday is FIRE. Trust me.",
    "Anyone got a spare turntable needle? Long story.",
    "The eating club party was unreal last night.",
    "Making a mixtape. Requests open in the comments.",
    "Slept through my 9am again. The DJ life is hard.",
  ],
  3: [
    "Got the LED matrix to scroll my name. Small wins.",
    "Lab partner ghosted me on the circuits report. Cool cool cool.",
    "Soldering iron burn count this semester: 4.",
    "Why is the printer in the EE building always broken.",
  ],
  4: [
    "Landed a kickflip off the library steps. Campus security disagreed.",
    "Markets are wild today and so is my macroeconomics grade.",
    "Skipped lecture to skate. No regrets. Mostly.",
    "Anyone want to split a pizza? I have $3 and a dream.",
    "New deck came in. She's a beauty.",
  ],
  5: [
    "Selling charcoal portraits, $5 or one (1) ramen pack.",
    "Spent 6 hours on a still life of an apple. The apple won.",
    "Gallery show in the student center next week, come through!",
    "My roommate is now my unpaid model. He doesn't know yet.",
  ],
  6: [
    "Intramural soccer SignUps close Friday. No excuses.",
    "We won 3-1. Pizza on me. (Captain's discount applies.)",
    "Practice at 6am tomorrow. Yes, 6. AM.",
    "If you say you'll show and you don't, I WILL find you.",
    "Cleats are optional. Effort is not.",
  ],
  7: [
    "Started a new novel at 2am. Regretting and loving it equally.",
    "Essay due tomorrow, word count: 0. Vibes: immaculate.",
    "Book club pick this month is a tearjerker. Bring tissues.",
    "Reading in the quad. The weather understood the assignment.",
  ],
  8: [
    "Halo LAN in my common room Saturday. BYO controller.",
    "Got destroyed at Smash by a freshman. Humbling.",
    "New keyboard arrived. My APM is about to go up.",
    "Anyone got a spare ethernet cable? For science.",
    "Speedran the problem set so I could speedrun a game instead.",
  ],
}

// Follow graph as [followerIdx, followingIdx] pairs. Intentionally asymmetric.
const FOLLOWS: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 8],
  [1, 0], [1, 7], [1, 5],
  [2, 0], [2, 4], [2, 8], [2, 5],
  [3, 0], [3, 1], [3, 8],
  [4, 2], [4, 6], [4, 8],
  [5, 1], [5, 7],
  [6, 4], [6, 0], [6, 3],
  [7, 1], [7, 5], [7, 8],
  [8, 0], [8, 2], [8, 4], [8, 6],
]

// Likes as [userIdx, authorIdx, postIdxWithinAuthor]. PK (user_id, post_id)
// — each pair is unique below.
const LIKES: [number, number, number][] = [
  [1, 0, 0], [2, 0, 0], [3, 0, 0], [8, 0, 0],
  [4, 0, 2], [6, 0, 2],
  [0, 1, 0], [5, 1, 1], [7, 1, 2],
  [0, 2, 0], [4, 2, 0], [8, 2, 0], [5, 2, 2],
  [1, 3, 0], [8, 3, 0],
  [2, 4, 0], [6, 4, 0], [8, 4, 4],
  [1, 5, 2], [7, 5, 0],
  [0, 6, 1], [3, 6, 1], [4, 6, 1],
  [1, 7, 0], [5, 7, 0], [8, 7, 3],
  [0, 8, 0], [2, 8, 0], [4, 8, 1], [6, 8, 0],
]

// Comments as [authorIdx, postAuthorIdx, postIdxWithinAuthor, content].
const COMMENTS: [number, number, number, string][] = [
  [1, 0, 0, "Finally! Adding everyone right now."],
  [2, 0, 0, "This is going to be huge."],
  [3, 0, 1, "Respect. The grind is real."],
  [8, 0, 2, "Same. Misery loves company."],
  [4, 0, 3, "Learned this the hard way too lol."],
  [0, 1, 0, "You got this. Chem is just spicy cooking."],
  [5, 1, 1, "Please don't tell anyone, I beg."],
  [7, 1, 2, "Cookie alert received. On my way."],
  [0, 2, 0, "Save me a spot on the list."],
  [4, 2, 2, "It was legendary. My ears are still ringing."],
  [8, 2, 3, "Put some Halo theme remix on it."],
  [1, 3, 0, "Tiny wins are still wins!"],
  [8, 3, 1, "Lab partners are a scam. Solidarity."],
  [2, 4, 0, "Security has it out for skaters I swear."],
  [6, 4, 3, "I have $2 and half a dream, let's combine."],
  [8, 4, 4, "She IS a beauty. Take me skating."],
  [1, 5, 0, "Drawing me next, here's my ramen."],
  [7, 5, 2, "Coming to the show, save me a flyer."],
  [0, 6, 1, "Captain's discount is the best discount."],
  [4, 6, 0, "Signing up now, don't yell at me."],
  [3, 6, 4, "Effort: located. Cleats: missing."],
  [1, 7, 1, "0 words is a strong start honestly."],
  [5, 7, 2, "Already crying and I haven't started."],
  [0, 8, 0, "Bringing my controller AND snacks."],
  [2, 8, 1, "Freshmen are built different now."],
  [6, 8, 4, "Productivity hack of the year."],
]

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!process.env.NEXTAUTH_SECRET || token !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const client = await getPool().connect()
  try {
    await client.query("BEGIN")

    // Clear prior demo data by marker; cascades to posts/follows/likes/comments.
    await client.query("DELETE FROM users WHERE email LIKE '%@demo.sml'")

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

    // Insert users, keep generated ids in author-index order.
    const userIds: string[] = []
    for (const u of USERS) {
      const res = await client.query<{ id: string }>(
        "INSERT INTO users (username, email, password_hash, bio) VALUES ($1, $2, $3, $4) RETURNING id",
        [u.username, `${u.username}@demo.sml`, passwordHash, u.bio]
      )
      userIds.push(res.rows[0].id)
    }

    // Insert posts; map [authorIdx, postIdxWithinAuthor] -> post id for likes/comments.
    const postIds: Record<string, string> = {}
    let hoursAgo = 0
    let postCount = 0
    for (const authorIdx of Object.keys(POSTS).map(Number)) {
      const contents = POSTS[authorIdx]
      for (let p = 0; p < contents.length; p++) {
        // Spread created_at over the last ~10 days (240h), oldest first.
        hoursAgo += 6 + ((authorIdx + p) % 5)
        const offset = Math.min(hoursAgo, 240)
        const res = await client.query<{ id: string }>(
          `INSERT INTO posts (user_id, content, created_at)
           VALUES ($1, $2, now() - ($3 || ' hours')::interval)
           RETURNING id`,
          [userIds[authorIdx], contents[p], offset]
        )
        postIds[`${authorIdx}:${p}`] = res.rows[0].id
        postCount++
      }
    }

    // Follow graph.
    let followCount = 0
    for (const [followerIdx, followingIdx] of FOLLOWS) {
      await client.query(
        `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userIds[followerIdx], userIds[followingIdx]]
      )
      followCount++
    }

    // Likes.
    let likeCount = 0
    for (const [userIdx, authorIdx, postIdx] of LIKES) {
      const postId = postIds[`${authorIdx}:${postIdx}`]
      if (!postId) continue
      await client.query(
        `INSERT INTO likes (user_id, post_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userIds[userIdx], postId]
      )
      likeCount++
    }

    // Comments.
    let commentCount = 0
    for (const [authorIdx, postAuthorIdx, postIdx, content] of COMMENTS) {
      const postId = postIds[`${postAuthorIdx}:${postIdx}`]
      if (!postId) continue
      await client.query(
        "INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)",
        [postId, userIds[authorIdx], content]
      )
      commentCount++
    }

    await client.query("COMMIT")

    return NextResponse.json({
      ok: true,
      counts: {
        users: userIds.length,
        posts: postCount,
        follows: followCount,
        likes: likeCount,
        comments: commentCount,
      },
    })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Seed failed:", err)
    return NextResponse.json({ ok: false, error: "Seed failed" }, { status: 500 })
  } finally {
    client.release()
  }
}
