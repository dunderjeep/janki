/** NOK per one unit of each currency. Edited by hand; the date says how stale. */
import { sql } from 'drizzle-orm'
import { db } from '../host'
import { joblowskiRates } from '../schema'
import { JoblowskiError } from './store'
import type { Rates } from './types'

export async function getRates(): Promise<{ rates: Rates; updatedAt: string | null }> {
  const rows = await db.select().from(joblowskiRates)
  const rates: Rates = {}
  let updatedAt: Date | null = null
  for (const r of rows) {
    rates[r.currency] = r.nok
    if (!updatedAt || r.updatedAt > updatedAt) updatedAt = r.updatedAt
  }
  return { rates, updatedAt: updatedAt?.toISOString() ?? null }
}

/** Replaces the rates given; NOK itself is always 1. */
export async function setRates(input: Record<string, unknown>) {
  const rows: { currency: string; nok: number }[] = []
  for (const [currency, value] of Object.entries(input)) {
    const code = currency.toUpperCase().trim()
    if (!/^[A-Z]{3}$/.test(code) || code === 'NOK') continue
    const nok = Number(value)
    if (!(nok > 0) || nok > 1000) throw new JoblowskiError(`${code}: enter NOK per one ${code}`)
    rows.push({ currency: code, nok })
  }
  if (rows.length) {
    await db
      .insert(joblowskiRates)
      .values(rows.map((r) => ({ ...r, updatedAt: new Date() })))
      .onConflictDoUpdate({ target: joblowskiRates.currency, set: { nok: sql`excluded.nok`, updatedAt: sql`excluded.updated_at` } })
  }
  return getRates()
}
