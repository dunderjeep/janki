/** Types and formatting shared by the Dough page and server. */

export const CURRENCIES = ['NOK', 'CAD', 'USD', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]
/** Amounts in cents (øre), per currency. */
export type Money = Partial<Record<Currency, number>>

export type Tally = { id: string; frontId: string; onDate: string; amountCents: number; currency: Currency; note: string | null }

export type FrontSignal = {
  /** One line on where the front stands, e.g. "17 applied · 0 interviews · 0 offers". */
  line: string
  /** Money in this year, if the front makes any. */
  earned: Money
  /** The last time anything moved: a step ticked, an application sent, a sale. */
  lastMoved: string | null
  tallies: Tally[]
}

export type Scoreboard = { month: Money; year: Money }

export type DoughSignals = { fronts: Record<string, FrontSignal>; score: Scoreboard }

export function formatMoney(m: Money): string {
  return (Object.entries(m) as [Currency, number][])
    .filter(([, v]) => v !== 0)
    .map(([c, v]) => `${(v / 100).toLocaleString('nb-NO', { maximumFractionDigits: v % 100 ? 2 : 0 })} ${c === 'NOK' ? 'kr' : c}`)
    .join(' + ')
}

