/**
 * Writing vouchers (bilag).
 *
 * Every kind of voucher is two lines — one account debited, one credited — and
 * which accounts each kind may touch is fixed here, so a sale can't be posted
 * to an expense account by a slip of the dropdown:
 *
 *   expense     Dr expense (4xxx–7xxx)        Cr bank / cash / 2030 paid privately
 *   sale        Dr bank / cash                Cr income (3xxx)
 *   owner_in    Dr bank / cash                Cr 2030 Privat innskudd
 *   owner_out   Dr 2040 Privat uttak          Cr bank / cash
 *   reversal    every line of the original, sides swapped
 *
 * Numbering is gapless (bokføringsforskriften wants an unbroken bilag series),
 * so it's taken under a per-owner advisory lock inside the transaction.
 */
import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import {
  bokkiReceipts,
  bokkiVoucherLines,
  bokkiVouchers,
  type BokkiAccount,
  type MvaRate,
  type VoucherKind,
} from '@/db/schema/bokki'
import { CODES, ensureChart } from './chart'
import { discardReceipts, storeReceipts, type UploadedFile } from './receipts'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type EnteredKind = Exclude<VoucherKind, 'reversal'>

export type VoucherInput = {
  kind: EnteredKind
  postedOn: string
  description: string
  counterparty: string | null
  amountOre: number
  /** The category: expense account for an expense, income account for a sale. Ignored for owner_*. */
  accountCode: string | null
  /** Where the money came from (expense, owner_out) or went into (sale, owner_in). */
  moneyCode: string
  mvaRate: MvaRate | null
  mvaOre: number | null
}

const MONEY = [CODES.bank, CODES.cash]

function sides(input: VoucherInput, chart: Map<string, BokkiAccount>): { debit: BokkiAccount; credit: BokkiAccount } {
  const get = (code: string | null, what: string) => {
    const a = code ? chart.get(code) : undefined
    if (!a) throw new Error(`${what}: no account ${code ?? '(none chosen)'}`)
    return a
  }
  const money = get(input.moneyCode, 'Paid with / received into')

  switch (input.kind) {
    case 'expense': {
      if (![...MONEY, CODES.ownerIn].includes(money.code as never)) throw new Error('An expense is paid from bank, cash, or privately')
      const expense = get(input.accountCode, 'Category')
      if (expense.type !== 'expense') throw new Error(`${expense.code} ${expense.name} is not an expense account`)
      return { debit: expense, credit: money }
    }
    case 'sale': {
      if (!MONEY.includes(money.code as never)) throw new Error('A sale is received into bank or cash')
      const income = get(input.accountCode, 'Category')
      if (income.type !== 'income') throw new Error(`${income.code} ${income.name} is not an income account`)
      return { debit: money, credit: income }
    }
    case 'owner_in':
      if (!MONEY.includes(money.code as never)) throw new Error('Owner money goes into bank or cash')
      return { debit: money, credit: get(CODES.ownerIn, 'Owner contributions') }
    case 'owner_out':
      if (!MONEY.includes(money.code as never)) throw new Error('A withdrawal comes out of bank or cash')
      return { debit: get(CODES.ownerOut, 'Owner withdrawals'), credit: money }
  }
}

export function validate(input: VoucherInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.postedOn) || Number.isNaN(Date.parse(input.postedOn))) {
    throw new Error('Date must be YYYY-MM-DD')
  }
  if (!input.description.trim()) throw new Error('Description is required')
  if (!Number.isInteger(input.amountOre) || input.amountOre <= 0) throw new Error('Amount must be more than zero')
  if (input.mvaOre !== null && (input.mvaOre < 0 || input.mvaOre >= input.amountOre)) {
    throw new Error('MVA must be less than the total amount')
  }
}

async function nextVoucherNo(tx: Tx, uid: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bokki:${uid}`}))`)
  const { rows } = await tx.execute<{ n: number }>(
    sql`select coalesce(max(voucher_no), 0) + 1 as n from bokki.vouchers where owner_uid = ${uid}`,
  )
  return Number(rows[0].n)
}

/**
 * Store the receipt files, then post the voucher and its receipt rows in one
 * transaction. If the transaction fails the files are deleted again — they
 * were never part of the books.
 */
export async function createVoucher(uid: string, input: VoucherInput, files: UploadedFile[]): Promise<number> {
  validate(input)
  const stored = await storeReceipts(uid, files)
  try {
    return await db.transaction(async (tx) => {
      const chart = await ensureChart(tx, uid)
      const { debit, credit } = sides(input, chart)
      const voucherNo = await nextVoucherNo(tx, uid)
      const id = nanoid()

      await tx.insert(bokkiVouchers).values({
        id,
        ownerUid: uid,
        voucherNo,
        postedOn: input.postedOn,
        kind: input.kind,
        description: input.description.trim(),
        counterparty: input.counterparty?.trim() || null,
        mvaRate: input.mvaRate,
        mvaCents: input.mvaOre,
      })
      await tx.insert(bokkiVoucherLines).values([
        { voucherId: id, accountId: debit.id, debitCents: input.amountOre },
        { voucherId: id, accountId: credit.id, creditCents: input.amountOre },
      ])
      if (stored.length) {
        await tx.insert(bokkiReceipts).values(stored.map((s) => ({ ...s, ownerUid: uid, voucherId: id })))
      }
      return voucherNo
    })
  } catch (err) {
    await discardReceipts(stored)
    throw err
  }
}

async function findVoucher(tx: Tx, uid: string, voucherNo: number) {
  const [v] = await tx
    .select()
    .from(bokkiVouchers)
    .where(and(eq(bokkiVouchers.ownerUid, uid), eq(bokkiVouchers.voucherNo, voucherNo)))
  if (!v) throw new Error(`No voucher ${voucherNo}`)
  return v
}

/** Attach more documentation to a voucher already posted (e.g. the receipt turned up later). */
export async function addReceipts(uid: string, voucherNo: number, files: UploadedFile[]): Promise<number> {
  if (files.length === 0) throw new Error('No files')
  const v = await db.transaction((tx) => findVoucher(tx, uid, voucherNo))
  const stored = await storeReceipts(uid, files)
  try {
    await db.insert(bokkiReceipts).values(stored.map((s) => ({ ...s, ownerUid: uid, voucherId: v.id })))
  } catch (err) {
    await discardReceipts(stored)
    throw err
  }
  return stored.length
}

/**
 * Cancel a voucher by posting its mirror image. The original stays in the
 * books, visibly reversed — that is the audit trail.
 */
export async function reverseVoucher(uid: string, voucherNo: number, postedOn: string, reason: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postedOn)) throw new Error('Date must be YYYY-MM-DD')
  return db.transaction(async (tx) => {
    const n = await nextVoucherNo(tx, uid)
    const original = await findVoucher(tx, uid, voucherNo)
    if (original.kind === 'reversal') throw new Error('A reversal cannot itself be reversed — post the entry again instead')
    const [already] = await tx.select({ no: bokkiVouchers.voucherNo }).from(bokkiVouchers).where(eq(bokkiVouchers.reversesId, original.id))
    if (already) throw new Error(`Voucher ${voucherNo} was already reversed by voucher ${already.no}`)

    const lines = await tx.select().from(bokkiVoucherLines).where(eq(bokkiVoucherLines.voucherId, original.id))
    const id = nanoid()
    await tx.insert(bokkiVouchers).values({
      id,
      ownerUid: uid,
      voucherNo: n,
      postedOn,
      kind: 'reversal',
      description: `Reverses #${voucherNo}: ${original.description}${reason.trim() ? ` — ${reason.trim()}` : ''}`,
      counterparty: original.counterparty,
      reversesId: original.id,
    })
    await tx.insert(bokkiVoucherLines).values(
      lines.map((l) => ({ voucherId: id, accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })),
    )
    return n
  })
}
