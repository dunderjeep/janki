/**
 * Augment the next-auth Session type so session.user.id is typed.
 * NextAuth v5 with a database strategy populates user.id from the DB row.
 */
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
    }
  }
}
