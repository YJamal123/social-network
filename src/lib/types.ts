export interface User {
  id: string
  username: string
  email: string
  password_hash: string
  bio: string | null
  relationship_status: string | null
  interests: string | null
  courses: string | null
  created_at: string
}

export interface Post {
  id: string
  user_id: string
  content: string
  created_at: string
}

export interface Follow {
  follower_id: string
  following_id: string
}

export interface Like {
  user_id: string
  post_id: string
}

export interface Comment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
}

// Comment joined with its author — used in the comment thread
export interface CommentWithAuthor extends Comment {
  username: string
}

// Post joined with its author — used in the feed
export interface PostWithAuthor extends Post {
  username: string
  like_count: number
  liked_by_me: boolean
  comment_count: number
}

// A wall post — written by an author ON an owner's profile wall
export interface WallPost {
  id: string
  owner_id: string
  author_id: string
  content: string
  created_at: string
}

// Wall post joined with its author — used in the profile Wall section
export interface WallPostWithAuthor extends WallPost {
  author_username: string
}

// A poke from one user to another
export interface Poke {
  poker_id: string
  pokee_id: string
  created_at: string
  acknowledged: boolean
}

// Public-facing user view for a profile page (no email / password_hash)
export interface ProfileUser {
  id: string
  username: string
  bio: string | null
  relationship_status: string | null
  interests: string | null
  courses: string | null
  created_at: string
  post_count: number
  follower_count: number
  following_count: number
}
