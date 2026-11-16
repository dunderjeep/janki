/**
 * How each front is doing, from the apps that already record it: Joblowski for
 * the job search, Bokki for the business, and hand-entered tallies for
 * fronts janki has no app for. Nothing here is typed in twice.
 */
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { lastClosed, type ChainNode } from '@/lib/chains/tree'
import { ChainError } from '@/lib/chains/store'

import { CURRENCIES, formatMoney, type Currency, type DoughSignals, type FrontSignal, type Money, type Scoreboard, type Tally } from './money'

const add = (m: Money, c: Currency, cents: number) => {
  m[c] = (m[c] ?? 0) + cents
}
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)
const iso = (d: unknown): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' ? d.slice(0, 10) : null)

export async function doughSignals(uid: string, fronts: ChainNode[], today: string): Promise<DoughSignals> {
  const year = today.slice(0, 4)
  const month = today.slice(0, 7)
  const score: Scoreboard = { month: {}, year: {} }

  const [jobs, jobLast, bokki, tallies] = await Promise.all([
    db.execute<{ status: string; n: number }>(sql`
      select status, count(*)::int as n from joblowski.applications where owner_uid = ${uid} group by status`),
    db.execute<{ at: string | null }>(sql`
      select max(at)::text as at from joblowski.status_events where owner_uid = ${uid}`),
    db.execute<{ year: string; month: string; last: string | null }>(sql`
      select coalesce(sum(l.credit_cents - l.debit_cents) filter (where to_char(v.posted_on, 'YYYY') = ${year}), 0)::text as year,
             coalesce(sum(l.credit_cents - l.debit_cents) filter (where to_char(v.posted_on, 'YYYY-MM') = ${month}), 0)::text as month,
             (select max(posted_on)::text from bokki.vouchers where owner_uid = ${uid}) as last
        from bokki.voucher_lines l
        join bokki.vouchers v on v.id = l.voucher_id
        join bokki.accounts a on a.id = l.account_id
       where v.owner_uid = ${uid} and a.type = 'income'`),
    db.execute<{ id: string; front_id: string; on_date: string; amount_cents: string; currency: Currency; note: string | null }>(sql`
      select id, front_id, on_date::text, amount_cents::text, currency, note
        from dough.tallies where owner_uid = ${uid} order by on_date desc, created_at desc`),
  ])

  const count = (s: string) => jobs.rows.find((r) => r.status === s)?.n ?? 0
  const bokkiYear = Number(bokki.rows[0]?.year ?? 0)
  const bokkiMonth = Number(bokki.rows[0]?.month ?? 0)
  add(score.year, 'NOK', bokkiYear)
  add(score.month, 'NOK', bokkiMonth)

  const allTallies: Tally[] = tallies.rows.map((t) => ({
    id: t.id, frontId: t.front_id, onDate: t.on_date, amountCents: Number(t.amount_cents), currency: t.currency, note: t.note,
  }))
  for (const t of allTallies) {
    if (t.onDate.startsWith(year)) add(score.year, t.currency, t.amountCents)
    if (t.onDate.startsWith(month)) add(score.month, t.currency, t.amountCents)
  }

  const out: Record<string, FrontSignal> = {}
  for (const front of fronts) {
    const mine = allTallies.filter((t) => t.frontId === front.id)
    const earned: Money = {}
    for (const t of mine) if (t.onDate.startsWith(year)) add(earned, t.currency, t.amountCents)
    let line = ''
    let lastMoved = later(lastClosed(front), mine[0]?.onDate ?? null)

    if (front.signal === 'joblowski') {
      const sent = count('applied') + count('interview') + count('offer') + count('rejected') + count('withdrawn')
      line = `${sent} sent · ${count('interview')} interviewing · ${count('offer')} offers · ${count('rejected')} rejected`
      lastMoved = later(lastMoved, iso(jobLast.rows[0]?.at ?? null))
    } else if (front.signal === 'bokki') {
      add(earned, 'NOK', bokkiYear)
      line = bokkiYear ? `Sales this year ${formatMoney({ NOK: bokkiYear })}` : 'No sales booked in Bokki this year'
      lastMoved = later(lastMoved, iso(bokki.rows[0]?.last ?? null))
    } else if (front.signal === 'tally') {
      line = mine.length ? `${formatMoney(earned) || 'Nothing'} in this year` : 'No money in yet'
    }
    out[front.id] = { line, earned, lastMoved, tallies: mine.slice(0, 5) }
  }
  return { fronts: out, score }
}

export async function addTally(uid: string, body: Record<string, unknown>): Promise<void> {
  const frontId = typeof body.frontId === 'string' && /^[0-9a-f-]{8,64}$/i.test(body.frontId) ? body.frontId : null
  if (!frontId) throw new ChainError('Which front is this for?')
  const onDate = typeof body.onDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.onDate) ? body.onDate : null
  if (!onDate) throw new ChainError('Give a date')
  const currency = CURRENCIES.find((c) => c === body.currency)
  if (!currency) throw new ChainError('Pick a currency')
  const amount = Number(String(body.amount ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10_000_000) throw new ChainError('Give an amount, like 149 or 149,50')
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  await db.execute(sql`
    insert into dough.tallies (id, owner_uid, front_id, on_date, amount_cents, currency, note)
    values (${nanoid()}, ${uid}, ${frontId}, ${onDate}, ${Math.round(amount * 100)}, ${currency}, ${note})`)
}

export async function deleteTally(uid: string, id: string): Promise<void> {
  const { rowCount } = await db.execute(sql`delete from dough.tallies where id = ${id} and owner_uid = ${uid}`)
  if (!rowCount) throw new ChainError('Not found', 404)
}
