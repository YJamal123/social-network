import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import getPool from "@/lib/db"

// One-shot, idempotent demo-data seeder. Mirrors /api/migrate: token-guarded and
// run from inside the VPC (Cloud SQL is private-IP only, unreachable from a laptop).
// Re-runnable — it first deletes every demo account (email LIKE '%@demo.sml') and
// the ON DELETE CASCADE wipes their posts/follows/likes/comments/wall_posts/pokes,
// then reinserts.
// Run once after deploy:
//   curl -X POST "https://<url>/api/seed?token=$NEXTAUTH_SECRET"
//
// All demo accounts share the password: demo1234

const DEMO_PASSWORD = "demo1234"

interface DemoUser {
  username: string
  bio: string
  school: string
  relationshipStatus?: string
  interests?: string
  courses?: string
  interestedIn?: string
  lookingFor?: string
}

// ~9 users with characterful early-Facebook-era bios + profile fields. Schools
// span all eight Ivies (and are intentionally varied) so the cross-school Taunt
// guard and the Cornell-vs-Harvard head-to-head scoreboard have data to show.
const USERS: DemoUser[] = [
  {
    username: "thefacebook_tom",
    bio: "CS junior. Building things in my dorm. Poke me.",
    school: "Cornell",
    relationshipStatus: "Single",
    interests: "Coding, late-night pizza, growth hacking",
    courses: "CS161, CS50, Linear Algebra",
    interestedIn: "Women",
    lookingFor: "Friendship, Whatever I can get",
  },
  {
    username: "harvardhannah",
    bio: "Pre-med, perpetually in Lamont Library. Coffee is a food group.",
    school: "Harvard",
    relationshipStatus: "In a relationship",
    interests: "Organic chemistry, running, true-crime podcasts",
    courses: "Orgo II, Biostatistics, Cell Biology",
    interestedIn: "Men, Women",
    lookingFor: "A relationship",
  },
  {
    username: "djmarcus",
    bio: "Spinning records at the eating club this Friday. RSVP or regret it.",
    school: "Princeton",
    relationshipStatus: "It's complicated",
    interests: "Vinyl, mixtapes, throwing parties",
    courses: "Music Theory, Sociology 101",
    interestedIn: "Women",
    lookingFor: "Dating, Random play",
  },
  {
    username: "priya_codes",
    bio: "EE/CS double major. Soldering > sleeping.",
    school: "Cornell",
    relationshipStatus: "Single",
    interests: "Circuits, robotics, mechanical keyboards",
    courses: "Circuits, Signals & Systems, CS161",
    interestedIn: "Men",
    lookingFor: "Friendship",
  },
  {
    username: "skater_dave",
    bio: "Econ major who would rather be at the skatepark.",
    school: "Brown",
    interestedIn: "Women",
    lookingFor: "Whatever I can get",
  },
  {
    username: "artsy_lena",
    bio: "Visual arts. I will draw you for ramen money.",
    school: "Yale",
    relationshipStatus: "In a relationship",
    interests: "Charcoal portraits, gallery hopping, ramen",
    courses: "Studio Art, Art History, Intro Econ",
    interestedIn: "Men, Women",
    lookingFor: "A relationship, Dating",
  },
  {
    username: "coachrandy",
    bio: "Intramural soccer captain. Practice is NOT optional.",
    school: "Penn",
    interestedIn: "Women",
    lookingFor: "Friendship",
  },
  {
    username: "bookish_mei",
    bio: "English lit. Currently 4 novels deep, 0 essays written.",
    school: "Columbia",
    relationshipStatus: "It's complicated",
    interests: "Victorian novels, tea, procrastination",
    courses: "Modernist Lit, Creative Writing, Philosophy 101",
    interestedIn: "Men",
    lookingFor: "A relationship",
  },
  {
    username: "gamer_greg",
    bio: "Halo LAN party in my common room. BYO controller.",
    school: "Dartmouth",
    interestedIn: "Women",
    lookingFor: "Random play",
  },
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

// Wall posts as [ownerIdx, authorIdx, content]. Author always differs from owner
// (someone writing ON another person's wall). PK is generated, so no conflicts.
const WALL_POSTS: [number, number, string][] = [
  [0, 1, "Tom, the new directory is slick. Adding you right now!"],
  [0, 2, "Party at the eating club Friday — you're on the list."],
  [0, 8, "Bring your laptop to the LAN, we need another player."],
  [1, 0, "Good luck on the orgo exam, you've got this!"],
  [1, 5, "Found you a study buddy — me. I bring snacks."],
  [2, 4, "That set on Friday was unreal. Encore?"],
  [2, 8, "Need a Halo theme remix for the next mixtape."],
  [3, 0, "Saw your LED matrix demo — genuinely impressed."],
  [3, 6, "Soldering iron burns build character. Keep going."],
  [4, 2, "Skate session Saturday? Bring the new deck."],
  [5, 1, "Your charcoal portrait is hanging in my dorm now. Thank you!"],
  [5, 7, "Come to the gallery show, I saved you a spot."],
  [6, 4, "Signed up for intramural soccer. Don't make me regret it."],
  [7, 5, "Lending you my favorite novel — guard it with your life."],
  [8, 0, "Ethernet cable delivered to your door. For science."],
]

// Pokes as [pokerIdx, pokeeIdx, acknowledged]. PK (poker_id, pokee_id) — each
// ordered pair appears once. A few left unacknowledged so the indicator shows.
const POKES: [number, number, boolean][] = [
  [1, 0, false],
  [2, 0, false],
  [3, 0, true],
  [0, 1, false],
  [5, 1, true],
  [4, 2, false],
  [8, 0, true],
  [0, 3, false],
  [6, 4, true],
  [7, 5, false],
]

// Taunts as [taunterIdx, taunteeIdx, acknowledged]. Mirror pokes but every pair
// is CROSS-SCHOOL (the taunt guard rejects same-school) — see USERS schools.
// The Cornell (0,3) vs Harvard (1) exchanges feed the /taunts head-to-head
// scoreboard; a few are left unacknowledged so the header badge shows.
const TAUNTS: [number, number, boolean][] = [
  [0, 1, false], // Cornell -> Harvard
  [1, 0, false], // Harvard -> Cornell
  [3, 1, true], // Cornell -> Harvard
  [1, 3, false], // Harvard -> Cornell
  [2, 0, true], // Princeton -> Cornell
  [4, 5, false], // Brown -> Yale
  [6, 7, true], // Penn -> Columbia
  [8, 0, false], // Dartmouth -> Cornell
  [5, 2, true], // Yale -> Princeton
  [7, 1, false], // Columbia -> Harvard
]

// Relationships as [requesterIdx, addresseeIdx, status, confirmed]. PK is the
// ordered pair. Two confirmed links demo "In a relationship with @partner"; one
// pending proposal lights up the header indicator + /relationships requests.
const RELATIONSHIPS: [number, number, string, boolean][] = [
  [1, 5, "In a relationship", true], // harvardhannah <-> artsy_lena (confirmed)
  [2, 7, "It's complicated", true], // djmarcus <-> bookish_mei (confirmed)
  [4, 0, "In a relationship", false], // skater_dave -> thefacebook_tom (pending)
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
        `INSERT INTO users (username, email, password_hash, bio, school, relationship_status, interests, courses, interested_in, looking_for)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          u.username,
          `${u.username}@demo.sml`,
          passwordHash,
          u.bio,
          u.school,
          u.relationshipStatus ?? null,
          u.interests ?? null,
          u.courses ?? null,
          u.interestedIn ?? null,
          u.lookingFor ?? null,
        ]
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

    // Wall posts (author writes on owner's wall). Spread created_at over recent days.
    let wallPostCount = 0
    let wallHoursAgo = 0
    for (const [ownerIdx, authorIdx, content] of WALL_POSTS) {
      wallHoursAgo += 5 + ((ownerIdx + authorIdx) % 4)
      const offset = Math.min(wallHoursAgo, 240)
      await client.query(
        `INSERT INTO wall_posts (owner_id, author_id, content, created_at)
         VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
        [userIds[ownerIdx], userIds[authorIdx], content, offset]
      )
      wallPostCount++
    }

    // Pokes (some unacknowledged so the header indicator shows).
    let pokeCount = 0
    for (const [pokerIdx, pokeeIdx, acknowledged] of POKES) {
      await client.query(
        `INSERT INTO pokes (poker_id, pokee_id, acknowledged) VALUES ($1, $2, $3)
         ON CONFLICT (poker_id, pokee_id) DO UPDATE
           SET created_at = now(), acknowledged = EXCLUDED.acknowledged`,
        [userIds[pokerIdx], userIds[pokeeIdx], acknowledged]
      )
      pokeCount++
    }

    // Taunts (cross-school; some unacknowledged so the header indicator shows).
    let tauntCount = 0
    for (const [taunterIdx, taunteeIdx, acknowledged] of TAUNTS) {
      await client.query(
        `INSERT INTO taunts (taunter_id, tauntee_id, acknowledged) VALUES ($1, $2, $3)
         ON CONFLICT (taunter_id, tauntee_id) DO UPDATE
           SET created_at = now(), acknowledged = EXCLUDED.acknowledged`,
        [userIds[taunterIdx], userIds[taunteeIdx], acknowledged]
      )
      tauntCount++
    }

    // Relationships (linked partners; a couple confirmed, one pending).
    let relationshipCount = 0
    for (const [requesterIdx, addresseeIdx, status, confirmed] of RELATIONSHIPS) {
      await client.query(
        `INSERT INTO relationships (requester_id, addressee_id, status, confirmed) VALUES ($1, $2, $3, $4)
         ON CONFLICT (requester_id, addressee_id) DO UPDATE
           SET status = EXCLUDED.status, confirmed = EXCLUDED.confirmed, created_at = now()`,
        [userIds[requesterIdx], userIds[addresseeIdx], status, confirmed]
      )
      relationshipCount++
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
        wallPosts: wallPostCount,
        pokes: pokeCount,
        taunts: tauntCount,
        relationships: relationshipCount,
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
