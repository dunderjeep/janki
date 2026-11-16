/**
 * Pay as an ad states it. The amount is kept in the ad's own currency and
 * period, and turned into NOK a year, and CAD, only when shown, with the
 * rates table, so changing a rate changes every figure at once.
 *
 * Shared by the server (parsing at import) and the browser (showing).
 */
import type { Pay, Rates } from './types'

const SYM = String.raw`(?:NOK|kr\.?|kroner|USD|US\$|\$|EUR|€|GBP|£|CAD|C\$|SEK|DKK|CHF)`
// 550 000 | 550.000 | 153,000 | 120 | 25.5
const NUM = String.raw`(?:\d{1,3}(?:[  .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`
const TO = String.raw`\s*(?:-|–|—|to|til)\s*`
const AFTER = new RegExp(String.raw`(${NUM})\s?([kK])?(?:\s*${SYM})?(?:${TO}(${NUM})\s?([kK])?)?\s*(${SYM})(?![\p{L}\d])`, 'u')
const BEFORE = new RegExp(String.raw`(?<![\p{L}\d])(${SYM})\s*(${NUM})\s?([kK])?(?:${TO}(?:${SYM}\s*)?(${NUM})\s?([kK])?)?`, 'u')
const PERIOD: [RegExp, Pay['period']][] = [
  [/\b(?:per|pr\.?|an?|\/|i)\s*(?:hour|hr|time|timen)\b|\bhourly\b|\btimelønn\b/i, 'hour'],
  [/\b(?:per|pr\.?|a|\/|i)\s*(?:month|mo|måned|måneden|mnd)\b|\bmonthly\b|\bmånedslønn\b|\bmånedlig\b/i, 'month'],
  [/\b(?:per|pr\.?|a|\/)\s*(?:day|dag|dagen)\b|\bdaily\b|\bdagslønn\b/i, 'day'],
]

/** A rough, fixed idea of what a currency is worth, for telling pay from other numbers. */
const ROUGH_NOK: Record<string, number> = { NOK: 1, USD: 10, EUR: 11, GBP: 13, CAD: 7.5, SEK: 1, DKK: 1.5, CHF: 12 }
const HOURS_A_YEAR = 1950
const DAYS_A_YEAR = 230
const PER_YEAR: Record<Pay['period'], number> = { year: 1, month: 12, day: DAYS_A_YEAR, hour: HOURS_A_YEAR }
/** Pay a year in NOK that could be real, after a rough conversion. */
const PLAUSIBLE: Record<Pay['period'], [number, number]> = { year: [150_000, 8_000_000], month: [12_000, 600_000], day: [600, 40_000], hour: [80, 5_000] }

function currencyOf(text: string): string {
  const t = text.toUpperCase().replace(/\./g, '')
  if (/NOK|KR/.test(t)) return 'NOK'
  if (/USD|US\$/.test(t)) return 'USD'
  if (/EUR|€/.test(t)) return 'EUR'
  if (/GBP|£/.test(t)) return 'GBP'
  if (/CAD|C\$/.test(t)) return 'CAD'
  if (/SEK/.test(t)) return 'SEK'
  if (/DKK/.test(t)) return 'DKK'
  if (/CHF/.test(t)) return 'CHF'
  return 'USD'
}

function amount(raw: string, k: string | undefined): number {
  let s = raw.replace(/[  ]/g, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '')
  else s = s.replace(',', '.')
  const n = Number(s)
  return k ? n * 1000 : n
}

function periodNear(text: string, end: number): Pay['period'] {
  const window = text.slice(Math.max(0, end - 30), end + 40)
  for (const [re, period] of PERIOD) if (re.test(window)) return period
  return 'year'
}

/** A magnitude the parser does not read, so the number is not what it looks like. */
const MAGNITUDE = /^\s*(?:[MB]\b|bn\b|mio\b|mrd\b|million|billion|millioner|milliarder)/i
/** Money near these words is a round, a valuation or turnover, not pay. */
const NOT_PAY = /\b(?:raised|raise|raising|funding|funded|valuation|valued|revenue|ARR|MRR|turnover|omsetning|investment|investors|series [a-d]\b|budget|backed by|in funding)/i

function plausible(pay: Pay): boolean {
  const [lo, hi] = PLAUSIBLE[pay.period]
  const rate = ROUGH_NOK[pay.currency] ?? 10
  const nok = (v: number) => v * rate
  return nok(pay.min) >= lo && nok(pay.max ?? pay.min) <= hi
}

function readMatch(text: string, m: RegExpMatchArray, order: 'before' | 'after'): Pay | null {
  const start = m.index ?? 0
  const end = start + m[0].length
  if (MAGNITUDE.test(text.slice(end, end + 12)) || NOT_PAY.test(text.slice(Math.max(0, start - 60), end + 60))) return null
  const [sym, a, ak, b, bk] = order === 'before' ? [m[1], m[2], m[3], m[4], m[5]] : [m[5], m[1], m[2], m[3], m[4]]
  let min = amount(a, ak)
  let max = b ? amount(b, bk) : null
  if (max !== null && max < min) [min, max] = [max, min]
  if (!(min > 0)) return null
  const pay: Pay = { min, max, currency: currencyOf(sym), period: periodNear(text, (m.index ?? 0) + m[0].length) }
  return plausible(pay) ? pay : null
}

/** The first believable pay in a text, with the words it was read from, or null. */
export function findPay(text: string): { pay: Pay; at: string } | null {
  let from = 0
  while (from < text.length) {
    const rest = text.slice(from)
    const before = BEFORE.exec(rest)
    const after = AFTER.exec(rest)
    const m = !before ? after : !after ? before : (before.index ?? 0) <= (after.index ?? 0) ? before : after
    if (!m) return null
    const pay = readMatch(rest, m, m === before ? 'before' : 'after')
    if (pay) return { pay, at: m[0] }
    from += (m.index ?? 0) + m[0].length
  }
  return null
}

export const parsePayText = (text: string): Pay | null => findPay(text)?.pay ?? null

/** A source's own salary field first; it may lack a currency, which means dollars on the remote boards. */
export function parsePay(salary: string | null, description: string): Pay | null {
  if (salary) {
    const direct = parsePayText(salary)
    if (direct) return direct
    const m = new RegExp(String.raw`^\s*(${NUM})\s?([kK])?(?:${TO}(${NUM})\s?([kK])?)?`, 'u').exec(salary)
    if (m) {
      const pay: Pay = { min: amount(m[1], m[2]), max: m[3] ? amount(m[3], m[4]) : null, currency: 'USD', period: periodNear(salary, m[0].length) }
      if (plausible(pay)) return pay
    }
  }
  return parsePayText(description)
}

export const payColumns = (pay: Pay | null) => ({
  payMin: pay?.min ?? null,
  payMax: pay?.max ?? null,
  payCurrency: pay?.currency ?? null,
  payPeriod: pay?.period ?? null,
})

/** A year's pay in NOK, with the rates table; null when the currency is unknown. */
export function nokAYear(pay: Pay, rates: Rates): [number, number | null] | null {
  const rate = rates[pay.currency]
  if (!rate) return null
  const per = PER_YEAR[pay.period] * rate
  return [pay.min * per, pay.max === null ? null : pay.max * per]
}

const round = (n: number) => (n >= 10_000 ? Math.round(n / 1000) * 1000 : Math.round(n))
export const formatRange = ([a, b]: [number, number | null]) =>
  b === null || round(a) === round(b) ? round(a).toLocaleString('en-GB') : `${round(a).toLocaleString('en-GB')}–${round(b).toLocaleString('en-GB')}`

/** "USD 60,000–70,000 a month" as written, then "≈ 7,560,000 NOK a year · 1,008,000 CAD". */
export function describePay(pay: Pay, rates: Rates | null): { stated: string; converted: string | null } {
  const stated = `${pay.currency} ${formatRange([pay.min, pay.max])}${pay.period === 'year' ? '' : ` an ${pay.period === 'hour' ? 'hour' : pay.period === 'day' ? 'day' : 'month'}`.replace('an month', 'a month').replace('an day', 'a day')}`
  if (!rates) return { stated, converted: null }
  const nok = nokAYear(pay, rates)
  if (!nok) return { stated, converted: null }
  const cad = rates.CAD ? ([nok[0] / rates.CAD, nok[1] === null ? null : nok[1] / rates.CAD] as [number, number | null]) : null
  return { stated, converted: `≈ ${formatRange(nok)} NOK a year${cad ? ` · ${formatRange(cad)} CAD` : ''}` }
}
