/**
 * Edge-compatible NextAuth config — no Node.js imports (no pg, no DrizzleAdapter).
 * Used by middleware so it can run on the Edge runtime.
 * The full config in auth.ts adds the DrizzleAdapter on top of this.
 */
import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    // Allow the request if the user has a session, otherwise let middleware redirect
    authorized({ auth }) {
      return !!auth?.user
    },
    session({ session, token }) {
      // With JWT strategy, user.id comes from token.sub
      if (token?.sub) session.user.id = token.sub
      return session
    },
    jwt({ token, user }) {
      // Persist the DB user.id into the token on first sign-in
      if (user?.id) token.sub = user.id
      return token
    },
  },
} satisfies NextAuthConfig
