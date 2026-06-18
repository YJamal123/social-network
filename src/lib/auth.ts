import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getPrisma } from "@/lib/db"
import { authConfig } from "@/lib/auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase()
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const user = await getPrisma().user.findUnique({ where: { email } })
        if (!user) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, name: user.username, email: user.email }
      },
    }),
  ],
})
