/**
 * The default chart of accounts, and the rules that pick the other side of the
 * entry for each imported statement line.
 *
 * Numbering follows the usual convention: 1xxx assets, 2xxx liabilities,
 * 3xxx equity, 4xxx income, 5–6xxx expenses.
 */
import { eq } from 'drizzle-orm'
import {
  bankiAccounts,
  type AccountType,
  type BankiAccount,
  type StatementFormat,
} from '@/db/schema/banki'
import type { ParsedLine } from './parse'
import type { Tx } from './ledger'

export const CODES = {
  tdChequing: '1000',
  transfersClearing: '1900',
  tdVisa: '2100',
  pcMastercard: '2200',
  openingBalanceEquity: '3000',
  uncategorisedIncome: '4900',
  interestExpense: '6100',
  bankFees: '6200',
  uncategorisedExpense: '6900',
} as const

const DEFAULT_CHART: {
  code: string
  name: string
  type: AccountType
  statementFormat?: StatementFormat
}[] = [
  { code: CODES.tdChequing, name: 'TD Personal Chequing', type: 'asset', statementFormat: 'td_chequing' },
  // A card payment shows up twice — out of chequing, into the card — so each
  // side posts here. Once both statements are in, the pair cancels to $0; a
  // balance left over is a payment only one side has been imported for.
  { code: CODES.transfersClearing, name: 'Transfers in transit', type: 'asset' },
  { code: CODES.tdVisa, name: 'TD Visa', type: 'liability', statementFormat: 'td_visa' },
  { code: CODES.pcMastercard, name: 'PC Financial Mastercard', type: 'liability', statementFormat: 'pc_mastercard' },
  { code: CODES.openingBalanceEquity, name: 'Opening Balance Equity', type: 'equity' },
  { code: CODES.uncategorisedIncome, name: 'Uncategorised Income', type: 'income' },
  { code: CODES.interestExpense, name: 'Interest Expense', type: 'expense' },
  { code: CODES.bankFees, name: 'Bank Fees', type: 'expense' },
  { code: CODES.uncategorisedExpense, name: 'Uncategorised Expense', type: 'expense' },
]

/** Create any missing default accounts; return the owner's whole chart by code. */
export async function ensureChart(tx: Tx, uid: string): Promise<Map<string, BankiAccount>> {
  await tx
    .insert(bankiAccounts)
    .values(DEFAULT_CHART.map((a) => ({ ...a, ownerUid: uid })))
    .onConflictDoNothing({ target: [bankiAccounts.ownerUid, bankiAccounts.code] })
  const rows = await tx.select().from(bankiAccounts).where(eq(bankiAccounts.ownerUid, uid))
  return new Map(rows.map((r) => [r.code, r]))
}

// ── Posting rules ─────────────────────────────────────────────────────────────
// First match wins. The name is shown in the import report, so a surprising
// posting can always be traced back to the rule that made it.

type Rule = {
  name: string
  code: string
  applies: (format: StatementFormat, line: ParsedLine) => boolean
}

export const RULES: Rule[] = [
  {
    name: 'Card payment → transfers in transit',
    code: CODES.transfersClearing,
    applies: (format, { description, kind }) =>
      format === 'td_chequing'
        ? /TFR-TO C\/C|^TO:TD C\/C|^TD VISA\b|^PC MASTRCRD\b/i.test(description)
        : format === 'td_visa'
          ? /^PAYMENT\b/i.test(description)
          : kind?.toUpperCase() === 'PAYMENT',
  },
  {
    name: 'Interest charged',
    code: CODES.interestExpense,
    applies: (_format, { description, kind }) =>
      kind?.toUpperCase() === 'INTEREST' || /INTEREST|^OVERDRAFT INT?\b/i.test(description),
  },
  {
    name: 'Bank fee or fee rebate',
    code: CODES.bankFees,
    applies: (format, { description }) =>
      format === 'td_chequing' && /\bFEES?\b|^ACCT BAL\b/i.test(description),
  },
]

export function contraFor(
  format: StatementFormat,
  line: ParsedLine,
  accountType: AccountType,
): { code: string; rule: string } {
  const rule = RULES.find((r) => r.applies(format, line))
  if (rule) return { code: rule.code, rule: rule.name }

  if (accountType === 'asset') {
    return line.amountCents > 0
      ? { code: CODES.uncategorisedIncome, rule: 'Money in → uncategorised income' }
      : { code: CODES.uncategorisedExpense, rule: 'Money out → uncategorised expense' }
  }
  // On a card, a credit that isn't a payment is a refund: it reduces expense.
  return line.amountCents < 0
    ? { code: CODES.uncategorisedExpense, rule: 'Card charge → uncategorised expense' }
    : { code: CODES.uncategorisedExpense, rule: 'Card refund → uncategorised expense' }
}
