/** Mail's own tables, in the `mail` schema (migrations/0001_mail.sql). */
import { bigint, boolean, integer, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

const mail = pgSchema('mail')

export const accounts = mail.table('accounts', {
  id: text('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  label: text('label').notNull(),
  address: text('address').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(993),
  secure: boolean('secure').notNull().default(true),
  username: text('username').notNull(),
  secret: text('secret').notNull(),
  folders: text('folders').array().notNull(),
  syncDays: integer('sync_days').notNull().default(60),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AccountRow = typeof accounts.$inferSelect

// IMAP UIDs and UIDVALIDITY are 32-bit unsigned: numbers hold them exactly.
export const folders = mail.table('folders', {
  accountId: text('account_id').notNull(),
  name: text('name').notNull(),
  uidvalidity: bigint('uidvalidity', { mode: 'number' }).notNull(),
  lastUid: bigint('last_uid', { mode: 'number' }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.accountId, t.name] })])

export const messages = mail.table('messages', {
  id: text('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  accountId: text('account_id').notNull(),
  folder: text('folder').notNull(),
  uidvalidity: bigint('uidvalidity', { mode: 'number' }).notNull(),
  uid: bigint('uid', { mode: 'number' }).notNull(),
  messageId: text('message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  fromName: text('from_name').notNull().default(''),
  fromAddr: text('from_addr').notNull().default(''),
  toAddrs: text('to_addrs').notNull().default(''),
  subject: text('subject').notNull().default(''),
  snippet: text('snippet').notNull().default(''),
  textBody: text('text_body').notNull().default(''),
  htmlBody: text('html_body'),
  seen: boolean('seen').notNull().default(false),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  /** When it was dealt with here (made a task, archived, kept…). Null: still to process. */
  processedAt: timestamp('processed_at', { withTimezone: true }),
  /** Archived or deleted here, or gone from the server: out of the lists, kept 30 days for other apps. */
  removedAt: timestamp('removed_at', { withTimezone: true }),
})

export type MessageRow = typeof messages.$inferSelect

export const rules = mail.table('rules', {
  id: text('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  fromMatch: text('from_match').notNull().default(''),
  subjectMatch: text('subject_match').notNull().default(''),
  action: text('action').notNull(),
  archive: boolean('archive').notNull().default(true),
  applied: integer('applied').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type RuleRow = typeof rules.$inferSelect
