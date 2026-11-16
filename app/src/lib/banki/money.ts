/**
 * Integer-cents money. An amount is parsed from its decimal text straight into
 * cents, so no float ever holds a value that gets stored.
 *
 * Safe to import from client components — no server dependencies.
 */

/** "1,530.06" · "$110.00" · "-192" · "(12.50)" · "" → cents. Throws on anything else. */
export function parseCents(input: string): number {
  let s = input.trim().replace(/[$,\s]/g, '')
  if (s === '') return 0

  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    sign = -sign
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  const m = /^(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (m[1] === '' && !m[2])) throw new Error(`not an amount: "${input}"`)

  const frac = m[2] ?? ''
  // A spreadsheet cell holding a formula result can carry float noise
  // (6444.049999999). Rounding that to the cent is the only sane reading.
  if (frac.length > 2) return sign * Math.round(Number(`${m[1] || '0'}.${frac}`) * 100)

  return sign * (Number(m[1] || '0') * 100 + Number(frac.padEnd(2, '0')))
}

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

export function formatCents(cents: number): string {
  return CAD.format(cents / 100)
}
