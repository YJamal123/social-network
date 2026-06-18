import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      onboarded?: boolean
    }
  }
  interface User {
    id?: string
    onboarded?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    onboarded?: boolean
  }
}
