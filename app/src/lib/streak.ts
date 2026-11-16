/**
 * Local calendar dates and daily-streak arithmetic.
 *
 * A streak day is the user's OWN calendar day, so it must never be derived from
 * `toISOString()` - that yields the UTC date, which rolls over at 02:00 in CEST.
 * Under the old code a session at 00:30 local was filed under the previous day,
 * so you could practise two days running and still have the streak reset.
 *
 * The browser is the authority on the user's timezone, so clients send their own
 * local date and the server only falls back to its own clock.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** YYYY-MM-DD in the runtime's local timezone. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The calendar day before `date`. YYYY-MM-DD in, YYYY-MM-DD out. */
export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  // Anchored at noon UTC so no DST shift can drag the result into another day.
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

export function isDateString(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v))
}

/**
 * Take a client-supplied local date, but only if it is sane: well-formed and
 * within a day of the server's own date. Anything else falls back to the server
 * clock, so a broken clock cannot write an arbitrary date and inflate a streak.
 * One day of slack is exactly enough to cover a genuine timezone gap.
 */
export function resolveLocalDate(clientDate: unknown): string {
  const server = localDate()
  if (!isDateString(clientDate)) return server
  const delta = Math.abs(
    Date.parse(`${clientDate}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`),
  )
  return delta <= DAY_MS ? clientDate : server
}

export interface StreakState {
  streakCount:   number
  longestStreak: number
  lastStudyDate: string
}

/**
 * Fold one practice session on `today` into an existing streak.
 *
 * Pure and total, so both the SRS review route and the Morse trainer can share
 * it and cannot drift apart. Returns `prev` unchanged when today is already
 * counted, which is what makes repeated calls within a session idempotent.
 */
export function advanceStreak(prev: StreakState | null, today: string): StreakState {
  if (!prev || !prev.lastStudyDate) {
    return {
      streakCount:   1,
      longestStreak: Math.max(1, prev?.longestStreak ?? 0),
      lastStudyDate: today,
    }
  }

  // Already counted today.
  if (prev.lastStudyDate === today) return prev

  // Stored date is in the future: clock skew, or the user flew west. Lexical
  // comparison is valid for zero-padded YYYY-MM-DD. Don't punish it.
  if (prev.lastStudyDate > today) return prev

  const streakCount = prev.lastStudyDate === previousDate(today) ? prev.streakCount + 1 : 1
  return {
    streakCount,
    longestStreak: Math.max(streakCount, prev.longestStreak),
    lastStudyDate: today,
  }
}
