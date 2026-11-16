/**
 * Read side of Bokki. Every figure is summed from voucher_lines on demand —
 * nothing is cached, so nothing can drift from the vouchers.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import type { BokkiAccountType, MvaRate, VoucherKind } from '@/db/schema/bokki'

/** Assets and expenses grow by debits; equity, liabilities and income by credits. */
export const DEBIT_NORMAL: Record<BokkiAccountType, boolean> = {
  asset: true, expense: true, liability: false, equity: false, income: false,
}

/** MVA registration is required once VAT-able turnover passes this within 12 months (mval. § 2-1). */
export const MVA_THRESHOLD_ORE = 50_000_00

export type AccountRow = {
  code: string
  name: string
  nameEn: string
  type: BokkiAccountType
  /** Natural sign: an asset or expense as debits − credits, the rest as credits − debits. */
  amount: number
}

export type YearReport = {
  year: number
  /** Income and expense accounts, this year only. */
  income: AccountRow[]
  expenses: AccountRow[]
  result: number
  /** Asset, liability and equity accounts, everything up to 31 Dec. */
  assets: AccountRow[]
  equityAndLiabilities: AccountRow[]
  /** Profit of earlier years, not yet closed into equity. */
  priorResult: number
}

export async function yearReport(uid: string, year: number): Promise<YearReport> {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const { rows } = await db.execute<{
    code: string; name: string; name_en: string; type: BokkiAccountType; in_year: string; to_date: string; before: string
  }>(sql`
    select a.code, a.name, a.name_en, a.type,
           coalesce(sum(l.debit_cents - l.credit_cents) filter (where v.posted_on between ${from} and ${to}), 0)::text as in_year,
           coalesce(sum(l.debit_cents - l.credit_cents) filter (where v.posted_on <= ${to}), 0)::text as to_date,
           coalesce(sum(l.debit_cents - l.credit_cents) filter (where v.posted_on < ${from}), 0)::text as before
      from bokki.accounts a
      left join bokki.voucher_lines l on l.account_id = a.id
      left join bokki.vouchers v      on v.id = l.voucher_id
     where a.owner_uid = ${uid}
     group by a.id
     order by a.code
  `)

  const row = (r: (typeof rows)[number], debitPositive: number): AccountRow => ({
    code: r.code, name: r.name, nameEn: r.name_en, type: r.type,
    amount: (DEBIT_NORMAL[r.type] ? debitPositive : -debitPositive) || 0, // never −0
  })

  const income = rows.filter((r) => r.type === 'income').map((r) => row(r, Number(r.in_year)))
  const expenses = rows.filter((r) => r.type === 'expense').map((r) => row(r, Number(r.in_year)))
  const sum = (xs: AccountRow[]) => xs.reduce((s, x) => s + x.amount, 0)
  // Earlier years' income − expenses, from the debit-positive sums.
  const priorResult = -rows
    .filter((r) => r.type === 'income' || r.type === 'expense')
    .reduce((s, r) => s + Number(r.before), 0) || 0

  return {
    year,
    income,
    expenses,
    result: sum(income) - sum(expenses),
    assets: rows.filter((r) => r.type === 'asset').map((r) => row(r, Number(r.to_date))),
    equityAndLiabilities: rows
      .filter((r) => r.type === 'equity' || r.type === 'liability')
      .map((r) => row(r, Number(r.to_date))),
    priorResult,
  }
}

/** Income over the twelve months ending `asOf` — what the MVA threshold is measured on. */
export async function trailingTurnover(uid: string, asOf: string): Promise<number> {
  const { rows } = await db.execute<{ t: string }>(sql`
    select coalesce(sum(l.credit_cents - l.debit_cents), 0)::text as t
      from bokki.voucher_lines l
      join bokki.vouchers v on v.id = l.voucher_id
      join bokki.accounts a on a.id = l.account_id
     where v.owner_uid = ${uid} and a.type = 'income'
       and v.posted_on > (${asOf}::date - interval '12 months') and v.posted_on <= ${asOf}::date
  `)
  return Number(rows[0].t)
}

export type VoucherView = {
  voucherNo: number
  postedOn: string
  kind: VoucherKind
  description: string
  counterparty: string | null
  mvaRate: MvaRate | null
  mvaOre: number | null
  /** The voucher's size: its total debits. */
  amount: number
  reversesNo: number | null
  reversedByNo: number | null
  lines: { code: string; name: string; nameEn: string; debit: number; credit: number }[]
  receipts: { id: string; filename: string; contentType: string; sizeBytes: number; sha256: string }[]
  createdAt: string
}

function voucherQuery(uid: string, where: ReturnType<typeof sql>) {
  return db.execute<{
    voucher_no: number; posted_on: string; kind: VoucherKind; description: string; counterparty: string | null
    mva_rate: MvaRate | null; mva_cents: string | null; reverses_no: number | null; reversed_by_no: number | null
    created_at: string
    lines: VoucherView['lines']
    receipts: VoucherView['receipts'] | null
  }>(sql`
    select v.voucher_no, v.posted_on::text as posted_on, v.kind, v.description, v.counterparty,
           v.mva_rate, v.mva_cents::text as mva_cents, v.created_at::text as created_at,
           o.voucher_no as reverses_no, r.voucher_no as reversed_by_no,
           (select json_agg(json_build_object(
                     'code', a.code, 'name', a.name, 'nameEn', a.name_en,
                     'debit', l.debit_cents, 'credit', l.credit_cents
                   ) order by l.credit_cents, l.id)
              from bokki.voucher_lines l join bokki.accounts a on a.id = l.account_id
             where l.voucher_id = v.id) as lines,
           (select json_agg(json_build_object(
                     'id', rc.id, 'filename', rc.filename, 'contentType', rc.content_type,
                     'sizeBytes', rc.size_bytes, 'sha256', rc.sha256
                   ) order by rc.created_at)
              from bokki.receipts rc where rc.voucher_id = v.id) as receipts
      from bokki.vouchers v
      left join bokki.vouchers o on o.id = v.reverses_id
      left join bokki.vouchers r on r.reverses_id = v.id
     where v.owner_uid = ${uid} and ${where}
     order by v.posted_on desc, v.voucher_no desc
  `)
}

function toView(r: Awaited<ReturnType<typeof voucherQuery>>['rows'][number]): VoucherView {
  const lines = r.lines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) }))
  return {
    voucherNo: r.voucher_no, postedOn: r.posted_on, kind: r.kind, description: r.description,
    counterparty: r.counterparty, mvaRate: r.mva_rate, mvaOre: r.mva_cents === null ? null : Number(r.mva_cents),
    amount: lines.reduce((s, l) => s + l.debit, 0),
    reversesNo: r.reverses_no, reversedByNo: r.reversed_by_no,
    lines, receipts: r.receipts ?? [], createdAt: r.created_at,
  }
}

export async function listVouchers(uid: string, opts: { year: number; accountCode?: string }): Promise<VoucherView[]> {
  const where = opts.accountCode
    ? sql`extract(year from v.posted_on) = ${opts.year} and exists (
            select 1 from bokki.voucher_lines l join bokki.accounts a on a.id = l.account_id
             where l.voucher_id = v.id and a.code = ${opts.accountCode})`
    : sql`extract(year from v.posted_on) = ${opts.year}`
  const { rows } = await voucherQuery(uid, where)
  return rows.map(toView)
}

export async function getVoucher(uid: string, voucherNo: number): Promise<VoucherView | null> {
  const { rows } = await voucherQuery(uid, sql`v.voucher_no = ${voucherNo}`)
  return rows[0] ? toView(rows[0]) : null
}

/** Expenses with no receipt attached that still stand (not reversed). */
export async function missingReceipts(uid: string): Promise<VoucherView[]> {
  const { rows } = await voucherQuery(uid, sql`v.kind = 'expense'
    and not exists (select 1 from bokki.receipts rc where rc.voucher_id = v.id)
    and not exists (select 1 from bokki.vouchers x where x.reverses_id = v.id)`)
  return rows.map(toView)
}

export async function voucherYears(uid: string): Promise<number[]> {
  const { rows } = await db.execute<{ y: number }>(sql`
    select distinct extract(year from posted_on)::int as y from bokki.vouchers where owner_uid = ${uid} order by y desc
  `)
  return rows.map((r) => Number(r.y))
}

/** Today's date in Oslo, as YYYY-MM-DD — the server may not be on Oslo time. */
export function osloToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date())
}

export const KIND_LABEL: Record<VoucherKind, string> = {
  expense: 'Expense',
  sale: 'Sale',
  owner_in: 'Money in',
  owner_out: 'Withdrawal',
  reversal: 'Reversal',
}
