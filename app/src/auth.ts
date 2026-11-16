/**
 * Full NextAuth v5 config — runs server-side only (Node.js runtime).
 * Spreads the edge-safe authConfig and adds the DrizzleAdapter + JWT strategy.
 *
 * JWT strategy + adapter: OAuth accounts are still stored in the DB by the
 * adapter, but session validation uses a signed JWT cookie (no DB round-trip).
 * This means middleware can validate sessions without touching Postgres.
 */
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import {
  authUsers,
  authAccounts,
  authSessions,
  authVerificationTokens,
} from '@/db/schema/auth'
import { authConfig } from './auth.config'
import { resolveBlueskyPds, authenticateBluesky } from '@/lib/bluesky'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Bluesky via AT Protocol App Password — no OAuth client credentials needed.
    // The user creates an App Password in Bluesky Settings → Privacy & Security.
    // On first sign-in, a user row + account row are written to the DB so the
    // account can later be linked to a Google sign-in (or vice versa).
    Credentials({
      id: 'bluesky',
      name: 'Bluesky',
      credentials: {
        handle: { type: 'text' },
        appPassword: { type: 'password' },
      },
      async authorize(credentials) {
        const handle = (credentials.handle as string | undefined)?.trim().toLowerCase()
        const appPassword = credentials.appPassword as string | undefined
        if (!handle || !appPassword) return null

        try {
          const atSession = await authenticateBluesky(handle, appPassword)
          if (!atSession) return null
          const { did } = atSession

          // Look up an existing account row for this Bluesky DID.
          // This handles both standalone Bluesky accounts and accounts that have
          // been linked to a Google identity via the /api/auth/link-bluesky route.
          const existing = await db
            .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
            .from(authAccounts)
            .innerJoin(authUsers, eq(authAccounts.userId, authUsers.id))
            .where(
              and(
                eq(authAccounts.provider, 'bluesky'),
                eq(authAccounts.providerAccountId, did)
              )
            )
            .limit(1)

          if (existing.length > 0) {
            const u = existing[0]
            return { id: u.id, name: u.name, email: u.email ?? null, image: null }
          }

          // First-ever sign-in for this Bluesky DID — create user + account rows.
          const userId = nanoid()
          await db.insert(authUsers).values({
            id: userId,
            name: atSession.handle,
            email: null,
          })
          await db.insert(authAccounts).values({
            userId,
            type: 'credentials',
            provider: 'bluesky',
            providerAccountId: did,
          })

          return { id: userId, name: atSession.handle, email: null, image: null }
        } catch {
          return null
        }
      },
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  session: {
    strategy: 'jwt',
  },
})
