/** Day arithmetic on YYYY-MM-DD strings, in UTC so no time zone moves a date. */
export const DAY = 86_400_000
export const toDay = (s: string) => Date.parse(`${s}T00:00:00Z`)
export const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Every date a repeater lands on from `start` up to `to`, `start` included. */
export function repeats(start: string, repeat: string | null | undefined, to: string): string[] {
  const out = [start]
  const m = repeat && /(\d+)([dwmy])/.exec(repeat)
  if (!m) return out
  const n = Number(m[1])
  if (!n) return out
  const end = toDay(to)
  const d = new Date(toDay(start))
  for (let i = 0; i < 400; i++) {
    if (m[2] === 'd') d.setUTCDate(d.getUTCDate() + n)
    else if (m[2] === 'w') d.setUTCDate(d.getUTCDate() + 7 * n)
    else if (m[2] === 'm') d.setUTCMonth(d.getUTCMonth() + n)
    else d.setUTCFullYear(d.getUTCFullYear() + n)
    if (d.getTime() > end) break
    out.push(fromDay(d.getTime()))
  }
  return out
}

