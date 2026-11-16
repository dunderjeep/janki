/**
 * NextAuth v5 (Auth.js) tables — stored in the "auth" Postgres schema.
 *
 * DrizzleAdapter expects these exact column names. The `id` fields use nanoid
 * rather than UUID because nanoid is shorter and URL-safe; Auth.js accepts any
 * string primary key.
 */
import {
  pgSchema,
  text,
  timestamp,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const authSchema = pgSchema('auth')

// ── users ─────────────────────────────────────────────────────────────────────
export const authUsers = authSchema.table('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date', withTimezone: true }),
  image: text('image'),
})

// ── accounts ──────────────────────────────────────────────────────────────────
export const authAccounts = authSchema.table(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // These property names must stay snake_case: @auth/drizzle-adapter's
    // DefaultPostgresAccountsTable matches on the *property* keys, not the
    // column names. The underlying columns are unchanged, so no migration.
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

// ── sessions ──────────────────────────────────────────────────────────────────
export const authSessions = authSchema.table('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
})

// ── verification_tokens ───────────────────────────────────────────────────────
export const authVerificationTokens = authSchema.table(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)
