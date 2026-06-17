import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import getPool from "@/lib/db"

// One-shot, idempotent demo-data seeder. Mirrors /api/migrate: token-guarded and
// run from inside the VPC (Cloud SQL is private-IP only, unreachable from a laptop).
// Re-runnable — it first deletes every demo account (email LIKE '%@demo.sml') and
// the ON DELETE CASCADE wipes their posts/follows/likes/comments/wall_posts/pokes/messages,
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
    relationshipStatus: "Single",
    interests: "Skating, sneakers, day-trading beer money",
    courses: "Intro Econ, Statistics, Game Theory",
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
    relationshipStatus: "In a relationship",
    interests: "Soccer, protein shakes, motivational speeches",
    courses: "Sports Management, Marketing, Nutrition",
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
    relationshipStatus: "It's complicated",
    interests: "Halo, mechanical keyboards, energy drinks",
    courses: "CS101, Discrete Math, Game Design",
    interestedIn: "Women",
    lookingFor: "Random play",
  },
  {
    username: "rower_chad",
    bio: "Heavyweight crew, 5am erg sessions, econ on the side.",
    school: "Penn",
    relationshipStatus: "Single",
    interests: "Rowing, ergs, brunch recovery",
    courses: "Intro Econ, Accounting, Statistics",
    interestedIn: "Women",
    lookingFor: "Friendship",
  },
  {
    username: "ivy_isabel",
    bio: "Woodrow Wilson School. Debate team captain. Future senator (allegedly).",
    school: "Princeton",
    relationshipStatus: "It's complicated",
    interests: "Policy debate, model UN, op-eds",
    courses: "Politics 101, Microeconomics, Constitutional Law",
    interestedIn: "Men",
    lookingFor: "A relationship",
  },
  {
    username: "photog_nate",
    bio: "Photo editor at the Spectator. I shoot the city at 3am.",
    school: "Columbia",
    relationshipStatus: "Single",
    interests: "Film photography, darkrooms, vinyl",
    courses: "Photojournalism, Media Studies, Art History",
    interestedIn: "Women",
    lookingFor: "Dating, Whatever I can get",
  },
  {
    username: "a_capella_amy",
    bio: "Whiffenpoofs reject, still singing anyway. Catch me on Old Campus.",
    school: "Yale",
    relationshipStatus: "In a relationship",
    interests: "A cappella, sheet music, open mics",
    courses: "Music Theory, Vocal Performance, Psych 101",
    interestedIn: "Men, Women",
    lookingFor: "A relationship",
  },
  {
    username: "frat_brett",
    bio: "House social chair. The basement is open. Pong, anyone?",
    school: "Dartmouth",
    relationshipStatus: "Single",
    interests: "Pong, tailgates, ski trips",
    courses: "Government, Econ, Earth Sciences",
    interestedIn: "Women",
    lookingFor: "Random play, Whatever I can get",
  },
  {
    username: "thesis_tariq",
    bio: "Open curriculum means I take whatever I want. Currently: everything.",
    school: "Brown",
    relationshipStatus: "It's complicated",
    interests: "Philosophy, ultimate frisbee, espresso",
    courses: "Philosophy of Mind, CS15, Linguistics",
    interestedIn: "Men, Women",
    lookingFor: "Friendship, Dating",
  },
  {
    username: "premed_paula",
    bio: "Bio concentrator. If you see me outside the science center, something is wrong.",
    school: "Harvard",
    relationshipStatus: "Single",
    interests: "MCAT prep, hospital volunteering, yoga",
    courses: "Genetics, Orgo II, Biochemistry",
    interestedIn: "Men",
    lookingFor: "A relationship",
  },
  {
    username: "quad_quinn",
    bio: "Hotel school. I will judge your room-service order. Ithaca is gorges.",
    school: "Cornell",
    relationshipStatus: "Single",
    interests: "Hospitality, latte art, hiking the gorges",
    courses: "Hospitality Management, Marketing, Wines",
    interestedIn: "Men, Women",
    lookingFor: "Dating",
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
  9: [
    "5am erg test. My soul left my body at meter 1500.",
    "Crew won the sprints. Brunch is on the coxswain.",
    "If you row, you know. If you don't, why are you awake?",
    "Carbo-loading is just a personality at this point.",
    "Coach says 'one more piece.' Coach lies.",
  ],
  10: [
    "Won the debate round on a technicality. A win is a win.",
    "Model UN this weekend — I am once again France.",
    "Wrote an op-ed nobody asked for. You're welcome, campus.",
    "Constitutional Law reading is 200 pages. I have read 12.",
    "Future senator, current sleep-deprived. Vote for naps.",
  ],
  11: [
    "Shot the skyline at 3am. The city never sleeps and neither do I.",
    "Darkroom smells like victory and chemicals.",
    "Spectator deadline in 2 hours, 400 photos to cull. Send help.",
    "Found a roll of film I forgot to develop. It's like time travel.",
    "Golden hour on the steps of Low Library. No filter needed.",
  ],
  12: [
    "Whiffenpoofs said no. Old Campus said yes. Singing tonight!",
    "Lost my voice at the open mic. Worth every note.",
    "Learning a new arrangement. My suitemates are thrilled (they are not).",
    "Sheet music everywhere. My desk is a hazard.",
    "Spring jam concert next week — come for the harmonies, stay for the snacks.",
  ],
  13: [
    "Basement is OPEN. Pong table reset. Come through.",
    "Tailgate was historic. Details are classified.",
    "Ski trip this weekend, sign the list on the house door.",
    "Social chair duties: 10% planning, 90% damage control.",
    "Lost three rounds of pong to a freshman. Rebuilding.",
  ],
  14: [
    "Open curriculum is a gift and a curse. Took 6 classes for fun.",
    "Frisbee on the green, philosophy in my head, espresso in my veins.",
    "Read Descartes, now I doubt my own homework exists.",
    "Brown has no requirements and somehow I'm more confused than ever.",
    "CS15 project compiled on the first try. I am questioning reality.",
  ],
  15: [
    "Genetics midterm survived. Barely. Send Punnett squares.",
    "Volunteered at the hospital — humbling and amazing.",
    "MCAT countdown: too many days, not enough flashcards.",
    "Yoga at 6am to balance out the existential dread. It's working?",
    "Saw daylight today. Science center, release me.",
  ],
  16: [
    "Hotel school taught me to fold a napkin 6 ways. Use #4 is unclear.",
    "Latte art update: it looks like a cloud, possibly a ghost.",
    "Hiked the gorges. Ithaca really is gorges, I'm sorry.",
    "Room-service order of the week: nachos at 2am. Bold. Respect.",
    "Wines 101 is a real class and yes it is my favorite.",
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
  // — enrichment: wire new users (9–16) into the graph, asymmetrically —
  [9, 6], [9, 0], [9, 16],
  [10, 2], [10, 7], [10, 1],
  [11, 5], [11, 2], [11, 0],
  [12, 5], [12, 1], [12, 15],
  [13, 8], [13, 4], [13, 0],
  [14, 4], [14, 7], [14, 0],
  [15, 1], [15, 12],
  [16, 3], [16, 0], [16, 2],
  // old users following back new ones
  [0, 9], [0, 11], [1, 15], [2, 10], [3, 16], [5, 12], [8, 13],
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
  // — enrichment: new users liking old posts —
  [9, 0, 0], [10, 0, 3], [11, 1, 0], [12, 5, 2], [13, 8, 0], [14, 4, 1], [15, 1, 3], [16, 2, 0],
  // new users liking new users
  [9, 16, 0], [10, 11, 1], [11, 10, 2], [12, 9, 1], [13, 14, 3], [14, 13, 0], [15, 12, 4], [16, 15, 1],
  // old users liking new posts
  [0, 9, 1], [1, 15, 0], [2, 13, 0], [3, 16, 2], [4, 14, 1], [5, 12, 0], [6, 9, 0], [7, 11, 3], [8, 13, 1],
  // a few extra cross-likes
  [10, 12, 4], [11, 16, 2], [14, 10, 0], [15, 16, 3], [9, 14, 1],
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
  // — enrichment: comments on the new users' posts (and a few new users commenting) —
  [10, 9, 0, "This is why I do a sport that doesn't start at 5am."],
  [0, 9, 1, "Coxswain brunch is the only brunch."],
  [15, 9, 3, "Carbo-loading is the one thing premeds and rowers agree on."],
  [11, 10, 2, "As a fellow op-ed writer: the campus is not ready."],
  [2, 10, 1, "France again? Bold diplomatic choice."],
  [13, 11, 0, "3am skyline shots > 3am pong, respectfully."],
  [12, 11, 4, "Save me a print of the Low Library one!"],
  [16, 12, 0, "Old Campus acoustics are unmatched, go off."],
  [5, 12, 4, "Adding spring jam to my calendar in pen."],
  [14, 13, 2, "A ski trip AND a reading list? Brown could never schedule that."],
  [8, 13, 0, "Reset that pong table, I'm bringing the freshman who beat you."],
  [9, 14, 1, "Frisbee on the green is basically rowing for people who like fun."],
  [10, 14, 2, "Doubting your homework exists is a valid Brown strategy."],
  [1, 15, 0, "Punnett squares incoming, you've got this."],
  [6, 15, 3, "6am yoga? Respect. I do 6am sprints, we are the same."],
  [3, 16, 2, "Ithaca IS gorges and I will not apologize either."],
  [12, 16, 1, "The ghost latte is a feature, frame it."],
  [7, 16, 4, "Wines 101 is the most Cornell class imaginable."],
  [16, 3, 0, "LED matrix at the hotel school front desk? Make it happen."],
  [15, 1, 0, "Orgo solidarity. We suffer together."],
  [11, 2, 2, "Bring the DJ-cam to the gallery opening too."],
  [14, 7, 1, "0 words, immaculate vibes — the Brown way."],
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
  // — enrichment: walls wiring new users in (author always differs from owner) —
  [9, 6, "Welcome to the intramural circuit, rower. Soccer next?"],
  [10, 2, "Your op-ed was unhinged in the best way. DJ set dedicated to you Friday."],
  [11, 5, "Loved your skyline series — let's collab on the gallery show."],
  [12, 1, "Coffee before your spring jam? My treat, you'll need it."],
  [13, 8, "Bringing the LAN crew to your basement. Halo AND pong."],
  [14, 0, "Open curriculum guy, you'd love building things. Add me on thefacebook."],
  [15, 1, "Orgo study group, my room, snacks provided. You in?"],
  [16, 3, "Hotel school latte for the EE genius who fixed the printer."],
  [0, 9, "Saw you erging at 5am from my dorm window. Inspiring and terrifying."],
  [5, 12, "Your harmony on Old Campus stopped me mid-walk. Encore!"],
  [2, 11, "Need a photographer for Friday's set. You're hired (in exposure)."],
  [4, 14, "Frisbee on the green Saturday? Bring the espresso."],
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
  // — enrichment: a couple aimed unacknowledged at user 0 so the badge keeps showing —
  [9, 0, false],
  [16, 0, false],
  [10, 11, true],
  [12, 15, false],
  [13, 14, true],
  [15, 1, false],
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
  // — enrichment: more cross-school rivalry so every demo user has taunt activity —
  [0, 2, false], // Cornell -> Princeton
  [0, 5, true], //  Cornell -> Yale
  [3, 8, false], // Cornell -> Dartmouth
  [1, 4, true], //  Harvard -> Brown
  [5, 1, false], // Yale -> Harvard
  [6, 3, true], //  Penn -> Cornell
  [8, 1, false], // Dartmouth -> Harvard
  [2, 1, true], //  Princeton -> Harvard
  [7, 3, false], // Columbia -> Cornell
  [4, 3, true], //  Brown -> Cornell
  // — enrichment: new users (9 Penn, 10 Princeton, 11 Columbia, 12 Yale,
  //   13 Dartmouth, 14 Brown, 15 Harvard, 16 Cornell) — all cross-school —
  [9, 1, false], //  Penn -> Harvard
  [9, 16, true], //  Penn -> Cornell
  [10, 4, false], // Princeton -> Brown
  [11, 8, true], //  Columbia -> Dartmouth
  [12, 9, false], // Yale -> Penn
  [13, 15, true], // Dartmouth -> Harvard
  [14, 2, false], // Brown -> Princeton
  [15, 16, true], // Harvard -> Cornell  (Cornell-vs-Harvard scoreboard)
  [16, 15, false], // Cornell -> Harvard  (scoreboard, unacknowledged -> badge)
  [15, 0, true], //  Harvard -> Cornell  (scoreboard)
  [16, 1, false], // Cornell -> Harvard  (scoreboard)
  [10, 16, true], // Princeton -> Cornell
]

// Relationships as [requesterIdx, addresseeIdx, status, confirmed]. PK is the
// ordered pair. Two confirmed links demo "In a relationship with @partner"; one
// pending proposal lights up the header indicator + /relationships requests.
const RELATIONSHIPS: [number, number, string, boolean][] = [
  [1, 5, "In a relationship", true], // harvardhannah <-> artsy_lena (confirmed)
  [2, 7, "It's complicated", true], // djmarcus <-> bookish_mei (confirmed)
  [3, 6, "In a relationship", true], // priya_codes <-> coachrandy (confirmed)
  [4, 0, "In a relationship", false], // skater_dave -> thefacebook_tom (pending)
  // — enrichment: two more confirmed links + one pending; partners not already
  //   confirmed-linked elsewhere —
  [15, 9, "In a relationship", true], // premed_paula <-> rower_chad (confirmed)
  [12, 16, "In a relationship", true], // a_capella_amy <-> quad_quinn (confirmed)
  [10, 14, "It's complicated", false], // ivy_isabel -> thesis_tariq (pending)
]

// Messages as [senderIdx, recipientIdx, content, read]. Private 1:1 DMs. A few
// left read=false (aimed at user 0, thefacebook_tom) so the unread badge shows.
const MESSAGES: [number, number, string, boolean][] = [
  [1, 0, "Hey Tom! The directory looks amazing. How'd you build it so fast?", false],
  [0, 1, "Thanks Hannah! Just a lot of caffeine and raw SQL honestly.", true],
  [1, 0, "Haha classic. Want to grab coffee and talk shop sometime?", false],
  [2, 0, "Yo, putting you on the list for Friday. Bring your laptop, we need a DJ-cam operator.", false],
  [3, 0, "Your LED matrix demo was unreal. Can you show me the wiring sometime?", false],
  [0, 3, "For sure! Swing by the EE lab tomorrow afternoon.", true],
  [4, 6, "Coach, signed up for soccer. Please go easy on me at 6am.", true],
  [6, 4, "No promises. Cleats optional, effort mandatory. See you there.", true],
  [5, 7, "Saved you a spot at the gallery show — front row, obviously.", true],
  [7, 5, "You're the best. I'll bring the ramen as payment.", false],
  [8, 2, "Need that Halo theme remix for the LAN party. Can you cook one up?", true],
  [2, 8, "Already on it. It's going to slap.", false],
  // — enrichment: richer multi-message threads; newest inbound to user 0 left
  //   unread so the inbox badge stays prominent —
  // Thread A: rower_chad (9) <-> user 0 (unread to user 0)
  [9, 0, "Tom — heard you built the directory solo. As a rower I respect the 5am grind.", false],
  [0, 9, "Ha, the directory was its own kind of erg test. Mostly downhill though.", true],
  [9, 0, "Come watch the sprints Saturday, I'll get you on the dock.", false],
  // Thread B: ivy_isabel (10) <-> djmarcus (2)
  [10, 2, "Marcus, need a set for the debate after-party. Something victorious.", true],
  [2, 10, "Say less. I've got a whole 'I won on a technicality' anthem queued.", true],
  [10, 2, "Perfect. Loser buys the pizza, and it won't be me.", true],
  // Thread C: photog_nate (11) <-> artsy_lena (5)
  [11, 5, "Lena — your charcoal + my photos = joint show. Thoughts?", true],
  [5, 11, "YES. I'll trade you three portraits for darkroom access.", true],
  [11, 5, "Deal. Bring ramen, obviously.", false],
  // Thread D: a_capella_amy (12) <-> premed_paula (15)
  [12, 15, "Paula! Spring jam is next week, you HAVE to come.", true],
  [15, 12, "If I survive the genetics midterm, I'm there. Front row.", true],
  [12, 15, "I'll dedicate a song to your Punnett squares.", false],
  // Thread E: frat_brett (13) <-> gamer_greg (8)
  [13, 8, "Greg, bring the LAN crew to the basement. Halo upstairs, pong downstairs.", true],
  [8, 13, "Best sentence I've read all semester. We're in.", true],
  [13, 8, "Loser of pong has to run the ethernet cables.", true],
  // Thread F: quad_quinn (16) <-> user 0 (unread to user 0)
  [16, 0, "Tom, hotel school wants a directory for the front desk. Can I pick your brain?", false],
  [0, 16, "For a free latte? Absolutely. Swing by the lab.", true],
  [16, 0, "Two lattes. I'm generous. See you tomorrow.", false],
  // Thread G: thesis_tariq (14) <-> bookish_mei (7)
  [14, 7, "Mei — read any good Victorian novels lately? Asking for a philosophy crisis.", true],
  [7, 14, "Always. I'll lend you one if you promise not to annotate in pen.", true],
  [14, 7, "...I make no promises.", true],
  // Thread H: harvardhannah (1) <-> premed_paula (15)
  [1, 15, "Paula, orgo study room on the 4th floor. Don't tell anyone.", true],
  [15, 1, "My lips are sealed. Bringing the good cookies.", false],
  // A few extra one-offs to fill the inbox
  [6, 9, "Welcome to intramurals, rower. 6am soccer when crew's done?", true],
  [10, 11, "Need headshots for the Wilson School site. You free?", false],
  [3, 16, "Hotel school latte in exchange for printer repair? Deal of the century.", true],
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

    // Messages (private 1:1 DMs; some unread so the header indicator shows).
    // Spread created_at over recent days so threads sort believably.
    let messageCount = 0
    let messageHoursAgo = 0
    for (const [senderIdx, recipientIdx, content, read] of MESSAGES) {
      messageHoursAgo += 4 + ((senderIdx + recipientIdx) % 5)
      const offset = Math.min(messageHoursAgo, 240)
      await client.query(
        `INSERT INTO messages (sender_id, recipient_id, content, read, created_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' hours')::interval)`,
        [userIds[senderIdx], userIds[recipientIdx], content, read, offset]
      )
      messageCount++
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
        messages: messageCount,
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
