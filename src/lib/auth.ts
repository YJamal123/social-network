import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { query } from "@/lib/db"
import { authConfig } from "@/lib/auth.config"
import type { User } from "@/lib/types"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase()
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const result = await query<User>("SELECT * FROM users WHERE email = $1", [email])
        const user = result.rows[0]
        if (!user) return null

        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) return null

        return { id: user.id, name: user.username, email: user.email }
      },
    }),
  ],
})
