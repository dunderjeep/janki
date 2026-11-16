/**
 * NOK in integer øre. Parsed from text straight to øre, so no float ever holds
 * a stored value. Safe to import from client components.
 */

/**
 * "1 234,50" · "1234.50" · "kr 89,90" · "1.234,50" · "250" → øre.
 * Norwegian receipts use a decimal comma and a space (or dot) between
 * thousands, so a lone comma is always the decimal mark. Throws on anything else.
 */
export function parseOre(input: string): number {
  let s = input.replace(/kr\.?|nok/gi, '').replace(/[\s  ]/g, '')
  if (s === '') throw new Error('amount is empty')

  let sign = 1
  if (s.startsWith('-') || s.startsWith('−')) {
    sign = -1
    s = s.slice(1)
  }

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decimalMark: ',' | '.' | null = null
  if (lastComma >= 0 && lastDot >= 0) decimalMark = lastComma > lastDot ? ',' : '.'
  else if (lastComma >= 0) decimalMark = ','
  // A single dot is a decimal point; several dots can only be thousands.
  else if (lastDot >= 0 && s.indexOf('.') === lastDot) decimalMark = '.'

  let whole = s
  let frac = ''
  if (decimalMark) {
    const i = s.lastIndexOf(decimalMark)
    whole = s.slice(0, i)
    frac = s.slice(i + 1)
  }
  whole = whole.replace(/[.,]/g, '')

  if (!/^\d*$/.test(whole) || !/^\d{0,2}$/.test(frac) || (whole === '' && frac === '')) {
    throw new Error(`not an amount: "${input}"`)
  }
  return sign * (Number(whole || '0') * 100 + Number(frac.padEnd(2, '0')))
}

const NOK = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK' })

/** −1 234,50 kr */
export function formatNok(ore: number): string {
  return NOK.format(ore / 100)
}

/** The MVA inside a gross amount: gross × rate / (100 + rate), to the øre. */
export function mvaInGross(grossOre: number, rate: number): number {
  return Math.round((grossOre * rate) / (100 + rate))
}
