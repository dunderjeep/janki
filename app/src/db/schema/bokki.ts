/**
 * Bokki — bookkeeping for a Norwegian enkeltpersonforetak. Postgres schema "bokki".
 *
 *   accounts        chart of accounts, NS 4102 numbering (per owner)
 *   vouchers        bilag: one per economic event, gapless voucher_no per owner
 *   voucher_lines   its debits and credits
 *   receipts        the receipt / invoice files a voucher rests on
 *
 * The balancing and append-only rules live in migration 0014 as triggers.
 *
 * Money is integer øre (called cents throughout, as in Banki). Dates are
 * 'YYYY-MM-DD' strings — a receipt date is a calendar day, not an instant.
 */
import { pgSchema, text, integer, bigint, date, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const bokki = pgSchema('bokki')

export type BokkiAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type VoucherKind = 'expense' | 'sale' | 'owner_in' | 'owner_out' | 'reversal'
export type MvaRate = 0 | 12 | 15 | 25

export const bokkiAccounts = bokki.table(
  'accounts',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameEn: text('name_en').notNull(),
    type: text('type').$type<BokkiAccountType>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('bokki_accounts_owner_code_unique').on(t.ownerUid, t.code)],
)

export type BokkiAccount = typeof bokkiAccounts.$inferSelect

export const bokkiVouchers = bokki.table(
  'vouchers',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    voucherNo: integer('voucher_no').notNull(),
    postedOn: date('posted_on', { mode: 'string' }).notNull(),
    kind: text('kind').$type<VoucherKind>().notNull(),
    description: text('description').notNull(),
    counterparty: text('counterparty'),
    mvaRate: integer('mva_rate').$type<MvaRate>(),
    mvaCents: bigint('mva_cents', { mode: 'number' }),
    reversesId: text('reverses_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('bokki_vouchers_owner_no_unique').on(t.ownerUid, t.voucherNo),
    index('bokki_vouchers_owner_date_idx').on(t.ownerUid, t.postedOn),
  ],
)

export type BokkiVoucher = typeof bokkiVouchers.$inferSelect

export const bokkiVoucherLines = bokki.table(
  'voucher_lines',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    voucherId: text('voucher_id').notNull().references(() => bokkiVouchers.id),
    accountId: text('account_id').notNull().references(() => bokkiAccounts.id),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    creditCents: bigint('credit_cents', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('bokki_voucher_lines_voucher_idx').on(t.voucherId),
    index('bokki_voucher_lines_account_idx').on(t.accountId),
  ],
)

export const bokkiReceipts = bokki.table(
  'receipts',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    voucherId: text('voucher_id').notNull().references(() => bokkiVouchers.id),
    storageKey: text('storage_key').notNull().unique(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bokki_receipts_voucher_idx').on(t.voucherId)],
)

export type BokkiReceipt = typeof bokkiReceipts.$inferSelect
