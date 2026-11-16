/**
 * The chart of accounts for a small food ENK, numbered per NS 4102 (Norsk
 * Standard kontoplan) — the numbering every Norwegian accountant and every
 * accounting app (Fiken, Tripletex, Conta…) uses, so moving these books into
 * one later is a matter of matching codes:
 *
 *   1xxx eiendeler (assets)          4xxx varekostnad (cost of goods)
 *   2xxx egenkapital og gjeld        5xxx lønn (payroll — none in an ENK)
 *   3xxx salgsinntekt (income)       6–7xxx andre driftskostnader (operating costs)
 *
 * The class and the main accounts (1900, 1920, 3000, 4000, 6300, 6540, 7770…)
 * are standard. The owner-equity sub-accounts 2030/2040 are a choice within the
 * 20xx range; check them against whatever app the books move to.
 */
import { eq } from 'drizzle-orm'
import { bokkiAccounts, type BokkiAccount, type BokkiAccountType } from '@/db/schema/bokki'
import type { Tx } from './vouchers'

/**
 * Who the books belong to, set in .env.local: the trading name (the
 * underenhet), the ENK's legal name and its org number in Enhetsregisteret.
 * Any of them may be left out.
 */
export const BUSINESS_NAME = process.env.BOKKI_BUSINESS_NAME ?? ''
export const LEGAL_NAME = process.env.BOKKI_LEGAL_NAME ?? ''
export const ORG_NUMBER = process.env.BOKKI_ORG_NUMBER ?? ''

export const CODES = {
  cash: '1900',
  bank: '1920',
  equity: '2000',
  ownerIn: '2030',
  ownerOut: '2040',
  sales: '3000',
  ingredients: '4000',
  other: '7790',
} as const

export type ChartAccount = { code: string; name: string; nameEn: string; type: BokkiAccountType; hint?: string }

export const DEFAULT_CHART: ChartAccount[] = [
  { code: CODES.cash, name: 'Kontanter', nameEn: 'Cash', type: 'asset' },
  { code: CODES.bank, name: 'Bankinnskudd', nameEn: 'Bank account', type: 'asset',
    hint: 'Vipps and card sales settle here' },
  { code: CODES.equity, name: 'Egenkapital', nameEn: "Owner's equity", type: 'equity' },
  { code: CODES.ownerIn, name: 'Privat innskudd', nameEn: 'Owner contributions', type: 'equity',
    hint: 'Business costs you paid with your own money or card' },
  { code: CODES.ownerOut, name: 'Privat uttak', nameEn: 'Owner withdrawals', type: 'equity' },
  { code: CODES.sales, name: 'Salgsinntekt', nameEn: 'Sales', type: 'income' },
  { code: '3900', name: 'Annen driftsrelatert inntekt', nameEn: 'Other income', type: 'income' },
  { code: CODES.ingredients, name: 'Innkjøp av råvarer', nameEn: 'Ingredients', type: 'expense',
    hint: 'Flour, butter, sugar, eggs, maple syrup…' },
  { code: '4300', name: 'Innkjøp av varer for videresalg', nameEn: 'Goods for resale', type: 'expense' },
  { code: '6300', name: 'Leie lokale', nameEn: 'Kitchen / premises rent', type: 'expense' },
  { code: '6420', name: 'Leie datasystemer', nameEn: 'Software & subscriptions', type: 'expense' },
  { code: '6540', name: 'Inventar', nameEn: 'Equipment (under NOK 30 000)', type: 'expense',
    hint: 'Tart tins, mixer, scales — anything over 30 000 is capitalised instead' },
  { code: '6560', name: 'Rekvisita', nameEn: 'Supplies & packaging', type: 'expense',
    hint: 'Boxes, labels, baking paper' },
  { code: '6800', name: 'Kontorrekvisita', nameEn: 'Office supplies', type: 'expense' },
  { code: '6860', name: 'Møter, kurs, oppdatering', nameEn: 'Courses & training', type: 'expense',
    hint: 'e.g. a food hygiene course' },
  { code: '6900', name: 'Telefon', nameEn: 'Phone & internet', type: 'expense' },
  { code: '7140', name: 'Reisekostnad', nameEn: 'Travel & transport', type: 'expense' },
  { code: '7320', name: 'Reklamekostnad', nameEn: 'Marketing', type: 'expense' },
  { code: '7500', name: 'Forsikringspremie', nameEn: 'Insurance', type: 'expense' },
  { code: '7770', name: 'Bank- og kortgebyrer', nameEn: 'Bank, Vipps & card fees', type: 'expense' },
  { code: CODES.other, name: 'Annen kostnad', nameEn: 'Other expense', type: 'expense',
    hint: 'Fees to Brønnøysund, Mattilsynet, etc.' },
]

/** Create any missing default accounts; return the owner's whole chart by code. */
export async function ensureChart(tx: Tx, uid: string): Promise<Map<string, BokkiAccount>> {
  await tx
    .insert(bokkiAccounts)
    .values(DEFAULT_CHART.map((a) => ({ code: a.code, name: a.name, nameEn: a.nameEn, type: a.type, ownerUid: uid })))
    .onConflictDoNothing({ target: [bokkiAccounts.ownerUid, bokkiAccounts.code] })
  const rows = await tx.select().from(bokkiAccounts).where(eq(bokkiAccounts.ownerUid, uid))
  return new Map(rows.map((r) => [r.code, r]))
}

/** Where money came from or went to, for each kind of voucher. */
export const MONEY_ACCOUNTS = [
  { code: CODES.bank, label: 'Business bank account / Vipps (1920)' },
  { code: CODES.cash, label: 'Cash (1900)' },
] as const

export const PAID_PRIVATELY = { code: CODES.ownerIn, label: 'My own money / private card (2030)' } as const
