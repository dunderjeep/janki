/**
 * Banki — double-entry bookkeeping. Postgres schema "banki".
 *
 *   accounts          chart of accounts (per owner)
 *   imports           one row per statement file / spreadsheet tab imported
 *   statement_lines   bank lines verbatim, deduplicated across overlapping exports
 *   journal_entries   the general ledger: one entry per economic event
 *   journal_lines     its debits and credits
 *
 * The balancing rule and append-only rule live in migration 0013 as triggers —
 * see the comments there. Nothing here can express them, so nothing here
 * should be read as the whole contract.
 *
 * Money is always integer cents. Dates are 'YYYY-MM-DD' strings, never Date
 * objects: a statement date is a calendar day, not an instant, and turning it
 * into one invites the UTC roll-over bug documented on activity_streaks.
 */
import {
  pgSchema,
  text,
  integer,
  bigint,
  jsonb,
  date,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const banki = pgSchema('banki')

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type StatementFormat = 'td_chequing' | 'td_visa' | 'pc_mastercard'
export type EntrySource = 'statement' | 'opening' | 'reversal' | 'manual'

// ── accounts ──────────────────────────────────────────────────────────────────
export const bankiAccounts = banki.table(
  'accounts',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<AccountType>().notNull(),
    statementFormat: text('statement_format').$type<StatementFormat>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('accounts_owner_code_unique').on(t.ownerUid, t.code)],
)

export type BankiAccount = typeof bankiAccounts.$inferSelect

// ── imports ───────────────────────────────────────────────────────────────────
export const bankiImports = banki.table('imports', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  ownerUid: text('owner_uid').notNull(),
  accountId: text('account_id').notNull().references(() => bankiAccounts.id),
  filename: text('filename').notNull(),
  sheet: text('sheet'),
  format: text('format').$type<StatementFormat>().notNull(),
  fileSha256: text('file_sha256').notNull(),
  rowsRead: integer('rows_read').notNull(),
  rowsNew: integer('rows_new').notNull(),
  rowsDuplicate: integer('rows_duplicate').notNull(),
  firstDate: date('first_date', { mode: 'string' }),
  lastDate: date('last_date', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BankiImport = typeof bankiImports.$inferSelect

// ── statement_lines ───────────────────────────────────────────────────────────
export const bankiStatementLines = banki.table(
  'statement_lines',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    accountId: text('account_id').notNull().references(() => bankiAccounts.id),
    importId: text('import_id').notNull().references(() => bankiImports.id),
    postedOn: date('posted_on', { mode: 'string' }).notNull(),
    description: text('description').notNull(),
    // Signed as a debit to the account: + money in / card payment, − money out / charge.
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    balanceCents: bigint('balance_cents', { mode: 'number' }),
    // Chronological position within its import — breaks ties between lines on
    // the same day, which is what makes "the last printed balance" well defined.
    lineSeq: integer('line_seq').notNull(),
    fingerprint: text('fingerprint').notNull(),
    occurrence: integer('occurrence').notNull(),
    raw: jsonb('raw').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('statement_lines_dedup_unique').on(t.accountId, t.fingerprint, t.occurrence),
    index('statement_lines_account_date_idx').on(t.accountId, t.postedOn),
  ],
)

export type BankiStatementLine = typeof bankiStatementLines.$inferSelect

// ── journal_entries ───────────────────────────────────────────────────────────
export const bankiJournalEntries = banki.table(
  'journal_entries',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    entryNo: integer('entry_no').notNull(),
    postedOn: date('posted_on', { mode: 'string' }).notNull(),
    memo: text('memo').notNull(),
    source: text('source').$type<EntrySource>().notNull(),
    statementLineId: text('statement_line_id').references(() => bankiStatementLines.id),
    reversesId: text('reverses_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('journal_entries_owner_no_unique').on(t.ownerUid, t.entryNo),
    index('journal_entries_owner_date_idx').on(t.ownerUid, t.postedOn),
    index('journal_entries_statement_line_idx').on(t.statementLineId),
  ],
)

export type BankiJournalEntry = typeof bankiJournalEntries.$inferSelect

// ── journal_lines ─────────────────────────────────────────────────────────────
export const bankiJournalLines = banki.table(
  'journal_lines',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull().references(() => bankiJournalEntries.id),
    accountId: text('account_id').notNull().references(() => bankiAccounts.id),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    creditCents: bigint('credit_cents', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('journal_lines_entry_idx').on(t.entryId),
    index('journal_lines_account_idx').on(t.accountId),
  ],
)

export type BankiJournalLine = typeof bankiJournalLines.$inferSelect
