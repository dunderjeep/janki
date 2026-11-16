/**
 * Read side of the books: balances, reconciliation, ledger, journal.
 * All figures are derived from journal_lines — nothing is cached anywhere.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  bankiAccounts,
  bankiImports,
  type AccountType,
  type EntrySource,
  type StatementFormat,
} from '@/db/schema/banki'

/** Assets and expenses grow by debits; liabilities, equity and income by credits. */
export const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true, expense: true, liability: false, equity: false, income: false,
}

/** A debit-positive figure, as the account's type naturally reads it (a card owing $100 → 100). */
export function natural(type: AccountType, debitPositive: number): number {
  return DEBIT_NORMAL[type] ? debitPositive : -debitPositive
}

export type AccountSummary = {
  id: string
  code: string
  name: string
  type: AccountType
  statementFormat: StatementFormat | null
  debits: number
  credits: number
  /** Debit-positive. */
  balance: number
  /** Last running balance the bank printed, against the ledger on that same day. */
  reconciliation: { postedOn: string; statement: number; ledger: number } | null
}

export async function accountSummaries(uid: string): Promise<AccountSummary[]> {
  const { rows } = await db.execute<{
    id: string; code: string; name: string; type: AccountType; statement_format: StatementFormat | null
    debits: string; credits: string
    printed_on: string | null; printed: string | null; ledger_on_printed: string | null
  }>(sql`
    with totals as (
      select l.account_id, sum(l.debit_cents) as debits, sum(l.credit_cents) as credits
        from banki.journal_lines l
        join banki.journal_entries e on e.id = l.entry_id
       where e.owner_uid = ${uid}
       group by l.account_id
    ),
    last_printed as (
      select distinct on (s.account_id) s.account_id, s.posted_on, s.balance_cents
        from banki.statement_lines s
        join banki.imports i on i.id = s.import_id
       where s.owner_uid = ${uid} and s.balance_cents is not null
       order by s.account_id, s.posted_on desc, i.created_at desc, s.line_seq desc
    )
    select a.id, a.code, a.name, a.type, a.statement_format,
           coalesce(t.debits, 0)::text  as debits,
           coalesce(t.credits, 0)::text as credits,
           p.posted_on::text            as printed_on,
           p.balance_cents::text        as printed,
           (select coalesce(sum(l.debit_cents - l.credit_cents), 0)
              from banki.journal_lines l
              join banki.journal_entries e on e.id = l.entry_id
             where l.account_id = a.id and e.posted_on <= p.posted_on)::text as ledger_on_printed
      from banki.accounts a
      left join totals t       on t.account_id = a.id
      left join last_printed p on p.account_id = a.id
     where a.owner_uid = ${uid}
     order by a.code
  `)

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    statementFormat: r.statement_format,
    debits: Number(r.debits),
    credits: Number(r.credits),
    balance: Number(r.debits) - Number(r.credits),
    reconciliation: r.printed_on === null
      ? null
      : { postedOn: r.printed_on, statement: Number(r.printed), ledger: Number(r.ledger_on_printed) },
  }))
}

export type LedgerRow = {
  entryNo: number
  postedOn: string
  memo: string
  source: EntrySource
  debit: number
  credit: number
  contra: string
  /** Natural-sign running balance after this line. */
  running: number
}

export async function generalLedger(uid: string, accountId: string, type: AccountType): Promise<LedgerRow[]> {
  const { rows } = await db.execute<{
    entry_no: number; posted_on: string; memo: string; source: EntrySource
    debit: string; credit: string; contra: string | null
  }>(sql`
    select e.entry_no, e.posted_on::text as posted_on, e.memo, e.source,
           l.debit_cents::text as debit, l.credit_cents::text as credit,
           (select string_agg(a2.code || ' ' || a2.name, ', ' order by a2.code)
              from banki.journal_lines l2
              join banki.accounts a2 on a2.id = l2.account_id
             where l2.entry_id = e.id and l2.id <> l.id) as contra
      from banki.journal_lines l
      join banki.journal_entries e on e.id = l.entry_id
     where l.account_id = ${accountId} and e.owner_uid = ${uid}
     order by e.posted_on, e.entry_no, l.id
  `)

  let running = 0
  return rows.map((r) => {
    const debit = Number(r.debit)
    const credit = Number(r.credit)
    running += natural(type, debit - credit)
    return {
      entryNo: r.entry_no, postedOn: r.posted_on, memo: r.memo, source: r.source,
      debit, credit, contra: r.contra ?? '', running,
    }
  })
}

export type JournalEntryView = {
  entryNo: number
  postedOn: string
  memo: string
  source: EntrySource
  reversesNo: number | null
  lines: { code: string; name: string; debit: number; credit: number }[]
}

export async function journal(uid: string, limit = 300): Promise<JournalEntryView[]> {
  const { rows } = await db.execute<{
    entry_no: number; posted_on: string; memo: string; source: EntrySource; reverses_no: number | null
    lines: { code: string; name: string; debit: number; credit: number }[]
  }>(sql`
    select e.entry_no, e.posted_on::text as posted_on, e.memo, e.source, r.entry_no as reverses_no,
           json_agg(json_build_object(
             'code', a.code, 'name', a.name, 'debit', l.debit_cents, 'credit', l.credit_cents
           ) order by l.credit_cents, l.id) as lines
      from banki.journal_entries e
      join banki.journal_lines l on l.entry_id = e.id
      join banki.accounts a      on a.id = l.account_id
      left join banki.journal_entries r on r.id = e.reverses_id
     where e.owner_uid = ${uid}
     group by e.id, r.entry_no
     order by e.entry_no desc
     limit ${limit}
  `)
  return rows.map((r) => ({
    entryNo: r.entry_no, postedOn: r.posted_on, memo: r.memo, source: r.source,
    reversesNo: r.reverses_no, lines: r.lines,
  }))
}

export async function recentImports(uid: string, limit = 20) {
  return db
    .select({
      id: bankiImports.id,
      filename: bankiImports.filename,
      sheet: bankiImports.sheet,
      accountName: bankiAccounts.name,
      rowsRead: bankiImports.rowsRead,
      rowsNew: bankiImports.rowsNew,
      rowsDuplicate: bankiImports.rowsDuplicate,
      firstDate: bankiImports.firstDate,
      lastDate: bankiImports.lastDate,
      createdAt: bankiImports.createdAt,
    })
    .from(bankiImports)
    .innerJoin(bankiAccounts, eq(bankiAccounts.id, bankiImports.accountId))
    .where(eq(bankiImports.ownerUid, uid))
    .orderBy(desc(bankiImports.createdAt))
    .limit(limit)
}
