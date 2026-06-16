export interface User {
  id: string
  username: string
  email: string
  password_hash: string
  bio: string | null
  created_at: string
}

export interface Post {
  id: string
  user_id: string
  content: string
  created_at: string
}

// Post joined with its author — used in the feed
export interface PostWithAuthor extends Post {
  username: string
}

// Public-facing user view for a profile page (no email / password_hash)
export interface ProfileUser {
  id: string
  username: string
  bio: string | null
  created_at: string
  post_count: number
}
