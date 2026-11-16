/**
 * Importing a statement file into the books.
 *
 * One file is one transaction: every tab lands, or none does. For each sheet:
 *
 *   1. record the import (the source document)
 *   2. insert its lines, letting the dedup constraint drop ones already held
 *   3. post an opening balance, if the export prints a running balance
 *   4. post one balanced journal entry per NEW line — bank account one side,
 *      the account a rule picks on the other (see chart.ts)
 *
 * A dry run does all of it, fires the deferred balance checks, then rolls back.
 * The preview is the real import minus the COMMIT.
 */
import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import {
  bankiImports,
  bankiJournalEntries,
  bankiJournalLines,
  bankiStatementLines,
  type BankiAccount,
  type EntrySource,
  type StatementFormat,
} from '@/db/schema/banki'
import { contraFor, CODES, ensureChart } from './chart'
import { guessFormat, parseStatement, readSheets, type Sheet, type SkippedRow } from './parse'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type BalanceBreak = {
  postedOn: string
  description: string
  expectedCents: number
  printedCents: number
}

export type SheetResult = {
  sheet: string | null
  format: StatementFormat | null
  account: { code: string; name: string } | null
  rowsRead: number
  rowsNew: number
  rowsDuplicate: number
  firstDate: string | null
  lastDate: string | null
  skipped: SkippedRow[]
  /** Lines where previous printed balance + this amount ≠ this printed balance. */
  balanceBreaks: BalanceBreak[]
  /** Debit-positive. `replaced` means an existing later opening was reversed. */
  opening: { postedOn: string; amountCents: number; replaced: boolean } | null
  /** Rule name → how many new lines it posted. */
  rules: Record<string, number>
  /** Why nothing was imported, when nothing was. */
  note: string | null
}

export type ImportResult = { dryRun: boolean; filename: string; sheets: SheetResult[] }

class DryRunRollback extends Error {
  constructor(readonly result: ImportResult) {
    super('dry run rollback')
  }
}

export async function importStatementFile(opts: {
  uid: string
  filename: string
  bytes: Buffer
  dryRun: boolean
  /** Required for a CSV whose filename doesn't say which account it is. */
  accountCode?: string
}): Promise<ImportResult> {
  const { uid, filename, bytes, dryRun, accountCode } = opts
  const sheets = readSheets(filename, bytes)
  const fileSha256 = createHash('sha256').update(bytes).digest('hex')

  try {
    return await db.transaction(async (tx) => {
      const chart = await ensureChart(tx, uid)
      // One poster at a time per owner, so entry numbers stay gapless and unique.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`banki:${uid}`}))`)

      const result: ImportResult = { dryRun, filename, sheets: [] }
      for (const sheet of sheets) {
        result.sheets.push(
          await importSheet(tx, { uid, filename, fileSha256, sheet, chart, accountCode }),
        )
      }

      if (dryRun) {
        // The balance triggers are deferred to COMMIT, which a dry run never
        // reaches. Fire them now so a preview fails exactly where an import would.
        await tx.execute(sql`set constraints all immediate`)
        throw new DryRunRollback(result)
      }
      return result
    })
  } catch (err) {
    if (err instanceof DryRunRollback) return err.result
    throw err
  }
}

type Posting = { accountId: string; amountCents: number } // debit-positive

async function importSheet(
  tx: Tx,
  a: {
    uid: string
    filename: string
    fileSha256: string
    sheet: Sheet
    chart: Map<string, BankiAccount>
    accountCode?: string
  },
): Promise<SheetResult> {
  const { uid, filename, fileSha256, sheet, chart } = a
  const nothing = (note: string | null): SheetResult => ({
    sheet: sheet.name, format: null, account: null,
    rowsRead: 0, rowsNew: 0, rowsDuplicate: 0, firstDate: null, lastDate: null,
    skipped: [], balanceBreaks: [], opening: null, rules: {}, note,
  })

  // ── Which account is this? ──────────────────────────────────────────────────
  let account: BankiAccount | undefined
  if (sheet.name === null && a.accountCode) {
    account = chart.get(a.accountCode)
    if (!account?.statementFormat) return nothing(`account ${a.accountCode} doesn't take statement imports`)
  } else {
    const format = guessFormat(sheet.name ?? filename, sheet.rows)
    if (!format) {
      return nothing(sheet.name
        ? 'not a statement tab — skipped'
        : "can't tell which account this export is from — pick one")
    }
    account = [...chart.values()].find((acc) => acc.statementFormat === format)
    if (!account) return nothing(`no account takes ${format} imports`)
  }
  const acct = account
  const format = acct.statementFormat!

  const { lines, skipped } = parseStatement(format, sheet.rows)
  const report: SheetResult = {
    ...nothing(null),
    format,
    account: { code: acct.code, name: acct.name },
    skipped,
    rowsRead: lines.length,
    firstDate: lines[0]?.postedOn ?? null,
    lastDate: lines.at(-1)?.postedOn ?? null,
  }
  if (lines.length === 0) return { ...report, note: 'no transaction rows found' }

  // ── Dedup keys ──────────────────────────────────────────────────────────────
  const seen = new Map<string, number>()
  const keyed = lines.map((line, lineSeq) => {
    const fingerprint = createHash('sha256')
      .update(`${line.postedOn}\n${line.description.toUpperCase()}\n${line.amountCents}`)
      .digest('hex')
      .slice(0, 32)
    const occurrence = seen.get(fingerprint) ?? 0
    seen.set(fingerprint, occurrence + 1)
    return { ...line, id: nanoid(), lineSeq, fingerprint, occurrence }
  })

  // ── 1–2. Source document and its lines ──────────────────────────────────────
  const importId = nanoid()
  await tx.insert(bankiImports).values({
    id: importId, ownerUid: uid, accountId: acct.id, filename, sheet: sheet.name, format,
    fileSha256, rowsRead: lines.length, rowsNew: 0, rowsDuplicate: 0,
    firstDate: report.firstDate, lastDate: report.lastDate,
  })

  const inserted = await tx
    .insert(bankiStatementLines)
    .values(keyed.map((l) => ({
      id: l.id, ownerUid: uid, accountId: acct.id, importId,
      postedOn: l.postedOn, description: l.description,
      amountCents: l.amountCents, balanceCents: l.balanceCents, lineSeq: l.lineSeq,
      fingerprint: l.fingerprint, occurrence: l.occurrence, raw: l.raw,
    })))
    .onConflictDoNothing({
      target: [bankiStatementLines.accountId, bankiStatementLines.fingerprint, bankiStatementLines.occurrence],
    })
    .returning({ id: bankiStatementLines.id })
  const newIds = new Set(inserted.map((r) => r.id))
  const fresh = keyed.filter((l) => newIds.has(l.id))

  report.rowsNew = fresh.length
  report.rowsDuplicate = keyed.length - fresh.length
  await tx
    .update(bankiImports)
    .set({ rowsNew: report.rowsNew, rowsDuplicate: report.rowsDuplicate })
    .where(eq(bankiImports.id, importId))

  // ── Journal ─────────────────────────────────────────────────────────────────
  const [{ n }] = (await tx.execute<{ n: number }>(sql`
    select coalesce(max(entry_no), 0)::int + 1 as n
      from banki.journal_entries where owner_uid = ${uid}
  `)).rows
  let entryNo = Number(n)
  const entries: (typeof bankiJournalEntries.$inferInsert)[] = []
  const journalLines: (typeof bankiJournalLines.$inferInsert)[] = []

  const post = (
    postedOn: string, memo: string, source: EntrySource, postings: Posting[],
    link: { statementLineId?: string; reversesId?: string } = {},
  ) => {
    const id = nanoid()
    entries.push({ id, ownerUid: uid, entryNo: entryNo++, postedOn, memo, source, ...link })
    for (const p of postings) {
      journalLines.push({
        entryId: id,
        accountId: p.accountId,
        debitCents: p.amountCents > 0 ? p.amountCents : 0,
        creditCents: p.amountCents < 0 ? -p.amountCents : 0,
      })
    }
  }

  // ── 3. Opening balance ──────────────────────────────────────────────────────
  // The balance before the earliest line held. Only posted when this file's
  // first line is new; if an opening already exists but this file reaches
  // further back, that opening is reversed and replaced — never edited.
  const first = keyed[0]
  if (first.balanceCents !== null && newIds.has(first.id)) {
    const openingCents = first.balanceCents - first.amountCents
    const postedOn = dayBefore(first.postedOn)
    const existing = await currentOpening(tx, uid, acct.id)

    if (!existing || existing.posted_on > postedOn) {
      const equity = chart.get(CODES.openingBalanceEquity)!
      if (existing) {
        const old = await tx
          .select({ accountId: bankiJournalLines.accountId, debit: bankiJournalLines.debitCents, credit: bankiJournalLines.creditCents })
          .from(bankiJournalLines)
          .where(eq(bankiJournalLines.entryId, existing.id))
        post(
          existing.posted_on,
          `Reversal of #${existing.entry_no} — opening balance superseded by an earlier statement`,
          'reversal',
          old.map((l) => ({ accountId: l.accountId, amountCents: l.credit - l.debit })),
          { reversesId: existing.id },
        )
      }
      if (openingCents !== 0) {
        post(postedOn, `Opening balance — ${acct.name}, per statement`, 'opening', [
          { accountId: acct.id, amountCents: openingCents },
          { accountId: equity.id, amountCents: -openingCents },
        ])
      }
      report.opening = { postedOn, amountCents: openingCents, replaced: !!existing }
    }
  }

  // ── 4. One entry per new line ───────────────────────────────────────────────
  for (const line of fresh) {
    const contra = contraFor(format, line, acct.type)
    report.rules[contra.rule] = (report.rules[contra.rule] ?? 0) + 1
    post(line.postedOn, line.description, 'statement', [
      { accountId: acct.id, amountCents: line.amountCents },
      { accountId: chart.get(contra.code)!.id, amountCents: -line.amountCents },
    ], { statementLineId: line.id })
  }

  if (entries.length) {
    await tx.insert(bankiJournalEntries).values(entries)
    await tx.insert(bankiJournalLines).values(journalLines)
  }

  // ── Check the bank's own arithmetic ─────────────────────────────────────────
  for (let i = 1; i < keyed.length; i++) {
    const prev = keyed[i - 1].balanceCents
    const cur = keyed[i]
    if (prev === null || cur.balanceCents === null) continue
    const expected = prev + cur.amountCents
    if (expected !== cur.balanceCents) {
      report.balanceBreaks.push({
        postedOn: cur.postedOn, description: cur.description,
        expectedCents: expected, printedCents: cur.balanceCents,
      })
    }
  }

  return report
}

/** The account's live opening-balance entry: posted, and not since reversed. */
async function currentOpening(tx: Tx, uid: string, accountId: string) {
  const { rows } = await tx.execute<{ id: string; entry_no: number; posted_on: string }>(sql`
    select e.id, e.entry_no, e.posted_on::text as posted_on
      from banki.journal_entries e
      join banki.journal_lines l on l.entry_id = e.id and l.account_id = ${accountId}
     where e.owner_uid = ${uid}
       and e.source = 'opening'
       and not exists (select 1 from banki.journal_entries r where r.reverses_id = e.id)
     order by e.entry_no desc
     limit 1
  `)
  return rows[0]
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
