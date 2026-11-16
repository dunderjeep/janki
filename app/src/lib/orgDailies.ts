/**
 * The daily files, read as a routine tracker.
 *
 * Half of a daily is a standing checklist that is identical every morning —
 * wake up, breathe, Meditate, exercise. Treating those as "today's attention"
 * puts fifteen unchanging items in the bullseye every day forever, which is
 * fifteen things that can never tell you anything by being there. So they are
 * separated out here: the routine is a *readout* (how much of today's practice
 * is done), and what is left over is what actually makes today different.
 *
 * The history is not something to start collecting. 437 of the 554 dailies
 * already carry checkbox state, back to 2023-03-01 — three and a half years of
 * completion data sitting in plain text, never once looked at.
 *
 * The dailies are notes at daily/YYYY-MM-DD.org (the notes/ package). Ticking a
 * box edits the note; see setRoutineItem.
 */
import { createNote, dayAgenda, editText, noteAt, notesUnder, orgText, replaceNoteText, textSha, type TextSave } from 'notes/server'
import { CHECKBOX, setCheckbox } from './orgChecklist'

export { CHECKBOX }

const DAILY_PATH = /^daily\/(\d{4}-\d{2}-\d{2})\.org$/
export const dailyPath = (date: string) => `daily/${date}.org`
/** `[[id:...][label]]` or `[[target]]` — the label is what a person reads. */
const ORG_LINK = /\[\[(?:[^\]]*)\]\[([^\]]*)\]\]|\[\[([^\]]*)\]\]/g

export type DailyItem = {
  /** Raw text as it appears after the checkbox, links and all. */
  raw: string
  /** Normalised for matching the same item across days. */
  key: string
  /** Human label with link syntax stripped. */
  label: string
  done: boolean
  /** org id this item links to, when it links to a note. */
  orgId: string | null
  /** 1-based line in the daily's text: where a tick is written. */
  line: number
}

export type Daily = { date: string; file: string; items: DailyItem[] }

/**
 * Item identity across days.
 *
 * Beyond stripping links and flattening case, this removes org emphasis markers
 * and normalises curly quotes. Wording drifts between days in ways that read as
 * identical but are not: this file holds both `What crucial moment do I face
 * today?` and `what *crucial moment* do i face today?`, which were counted as
 * two different items on 2 and 6 days — so neither crossed the 7-day line and
 * a question asked on 8 of the last 14 days was treated as a one-off.
 */
export function normaliseItem(raw: string): string {
  return raw
    .replace(ORG_LINK, (_, a, b) => a || b || '')
    // Org emphasis. `/italic/` is deliberately left alone — a slash is ordinary
    // punctuation here ("apply for job/search") and stripping it merges items
    // that really are different.
    .replace(/[*~=]/g, '')
    // Curly quotes and dashes, which arrive from copy-paste and from Emacs's
    // own electric-quote.
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Quotes are decoration around the same words, like the emphasis markers
    // above: `Do I love what I hate?` and `Do I "love what I hate"?` are one
    // item written twice.
    .replace(/["']/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s*[:\-]\s*$/, '')
}

export function stripLinks(raw: string): string {
  return raw.replace(ORG_LINK, (_, a, b) => a || b || '').replace(/\s+/g, ' ').trim()
}

const ID_IN_LINK = /\[\[id:([0-9a-fA-F-]{36})\]/

export function parseDaily(date: string, file: string, text: string): Daily {
  const items: DailyItem[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const m = CHECKBOX.exec(lines[i])
    if (!m) continue
    const raw = m[2]
    const key = normaliseItem(raw)
    // Runaway lines are prose that happens to start with a dash, not tasks.
    if (!key || key.length > 60) continue
    items.push({
      raw,
      key,
      label: stripLinks(raw) || raw,
      done: m[1] === 'X' || m[1] === 'x',
      orgId: ID_IN_LINK.exec(raw)?.[1] ?? null,
      line: i + 1,
    })
  }

  return { date, file, items }
}

/**
 * Dailies, newest first. `limit` bounds the read: the routine view wants a
 * fortnight, the history view wants everything.
 */
export async function readDailies(did: string, limit?: number): Promise<Daily[]> {
  // Read a little extra: anything else kept under daily/ must not crowd out a day.
  const notes = await notesUnder(did, 'daily/', limit ? limit + 30 : undefined)
  const out: Daily[] = []
  for (const n of notes) {
    const m = DAILY_PATH.exec(n.path)
    if (m) out.push(parseDaily(m[1], n.path, n.text))
    if (limit && out.length >= limit) break
  }
  return out
}

export function todayString(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

// ── Routine detection ─────────────────────────────────────────────────────────

/** How many of the recent days an item must appear in to count as routine. */
export const ROUTINE_THRESHOLD = 0.5
/** The window routine is judged over. */
export const ROUTINE_WINDOW = 14

/**
 * The keys that are standing practice rather than one-off tasks.
 *
 * Frequency over a recent window, not an explicit list: the routine changes —
 * "morse" and "french" came and went — and a hand-maintained list would be one
 * more thing to keep in sync with the files that already say it.
 */
export function routineKeys(dailies: Daily[], window = ROUTINE_WINDOW): Set<string> {
  const recent = dailies.slice(0, window)
  const withItems = recent.filter(d => d.items.length > 0)
  if (withItems.length === 0) return new Set()

  const freq = new Map<string, number>()
  for (const d of withItems) {
    for (const k of new Set(d.items.map(i => i.key))) {
      freq.set(k, (freq.get(k) ?? 0) + 1)
    }
  }

  const need = Math.max(2, Math.ceil(withItems.length * ROUTINE_THRESHOLD))
  return new Set([...freq].filter(([, n]) => n >= need).map(([k]) => k))
}

export type RoutineToday = {
  date: string
  /** Null when today's daily has not been created yet. */
  file: string | null
  /** The standing routine — items seen on half or more of recent days. */
  items: DailyItem[]
  done: number
  total: number
  /**
   * Everything else ticked into today's daily: one-off tasks.
   *
   * These had nowhere to appear before. A checkbox added today is on 1 of the
   * last 14 days, so it is correctly not routine — and was therefore invisible,
   * which is the wrong answer for the thing you just wrote down to do today.
   */
  todo: DailyItem[]
  todoDone: number
  todoTotal: number
  /** Always true: the notes are the current state. Kept for the panel. */
  live: boolean
}

export async function routineToday(did: string, now = new Date()): Promise<RoutineToday> {
  const dailies = await readDailies(did, ROUTINE_WINDOW + 1)
  const keys = routineKeys(dailies)
  const date = todayString(now)
  const today = dailies.find(d => d.date === date)

  // Note order throughout, so both lists match the daily as written: a
  // reordered checklist is a checklist you stop trusting.
  const all = today?.items ?? []
  const items = all.filter(i => keys.has(i.key))
  const todo = all.filter(i => !keys.has(i.key))

  return {
    date,
    file: today?.file ?? null,
    items,
    done: items.filter(i => i.done).length,
    total: items.length,
    todo,
    todoDone: todo.filter(i => i.done).length,
    todoTotal: todo.length,
    live: true,
  }
}

// ── History ───────────────────────────────────────────────────────────────────

export type ItemHistory = {
  key: string
  label: string
  /** Days the item appeared, newest first, with whether it was done. */
  days: { date: string; done: boolean }[]
  appeared: number
  completed: number
  /** Consecutive days done, counting back from the most recent appearance. */
  streak: number
  /** Longest run of consecutive done days over the whole history. */
  bestStreak: number
  /** False for an item that has dropped out of the current routine. */
  current: boolean
}

export type RoutineHistory = {
  from: string
  to: string
  days: number
  items: ItemHistory[]
  /** Per-day completion fraction, oldest first — the shape of the practice. */
  daily: { date: string; done: number; total: number }[]
}

/** Days of history that keep an item in the history view after it is retired. */
export const HISTORY_KEEP_DAYS = 20

/**
 * Completion history for the routine, current and retired.
 *
 * Not restricted to what is routine today. The corpus holds 683 distinct
 * checkbox labels and most are one-off tasks, so some filter is needed — but
 * filtering on *current* routine means dropping an item from your morning also
 * deletes its past from the view, and "morse, 154 days, 57%" is exactly the
 * kind of thing you want to be able to look back at. So an item shows if it is
 * routine now or ever ran for HISTORY_KEEP_DAYS.
 */
export async function routineHistory(did: string, limitDays?: number): Promise<RoutineHistory> {
  const all = await readDailies(did, limitDays)
  const withItems = all.filter(d => d.items.length > 0)

  const current = routineKeys(all)
  const seen = new Map<string, number>()
  for (const d of withItems) {
    for (const k of new Set(d.items.map(i => i.key))) seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const keys = new Set([
    ...current,
    ...[...seen].filter(([, n]) => n >= HISTORY_KEEP_DAYS).map(([k]) => k),
  ])

  const label = new Map<string, string>()
  const byKey = new Map<string, { date: string; done: boolean }[]>()
  const daily: { date: string; done: number; total: number }[] = []

  // Oldest first for the timeline; per-item arrays stay newest first.
  for (const d of [...withItems].reverse()) {
    const items = d.items.filter(i => keys.has(i.key))
    if (items.length === 0) continue
    daily.push({ date: d.date, done: items.filter(i => i.done).length, total: items.length })
    for (const i of items) {
      if (!label.has(i.key)) label.set(i.key, i.label)
      const list = byKey.get(i.key)
      if (list) list.unshift({ date: d.date, done: i.done })
      else byKey.set(i.key, [{ date: d.date, done: i.done }])
    }
  }

  const items: ItemHistory[] = [...byKey.entries()].map(([key, days]) => {
    let streak = 0
    for (const d of days) {
      if (!d.done) break
      streak++
    }
    let best = 0
    let run = 0
    // days is newest-first; direction does not matter for a longest run.
    for (const d of days) {
      run = d.done ? run + 1 : 0
      if (run > best) best = run
    }
    return {
      key,
      label: label.get(key) ?? key,
      days,
      appeared: days.length,
      completed: days.filter(d => d.done).length,
      streak,
      bestStreak: best,
      current: current.has(key),
    }
  })

  // Current routine first; retired items follow, still readable.
  items.sort((a, b) =>
    Number(b.current) - Number(a.current) ||
    b.appeared - a.appeared ||
    a.label.localeCompare(b.label))

  return {
    from: daily[0]?.date ?? '',
    to: daily[daily.length - 1]?.date ?? '',
    days: daily.length,
    items,
    daily,
  }
}

/** Ticks or unticks an item in today's daily, keeping its heading's [n/m] cookie true. */
export async function setRoutineItem(did: string, line: number, raw: string, want: 'done' | 'open', now = new Date()): Promise<void> {
  await editText(did, dailyPath(todayString(now)), (t) => setCheckbox(t, line, raw, want))
}

export type CreatedDaily = { file: string; created: boolean }

/** The horizon notes whose items for today go into a new daily's "Scheduled Tasks". */
const SCHEDULE_FROM = ['this_week.org', 'this_month.org', 'this_year.org']

/**
 * Today's daily, made as C-c n D made it: the title, then Templates/routine.org,
 * then "** Scheduled Tasks" holding today's agenda lines from this week, this
 * month and this year, then "** Notes". Idempotent: a daily with anything in it
 * is left as it is, and one holding only its title is filled.
 */
export async function createDaily(did: string, now = new Date(), day?: string): Promise<CreatedDaily> {
  const date = day ?? todayString(now)
  const path = dailyPath(date)
  const existing = await noteAt(did, path)
  const titleOnly = existing && !existing.note.headings.length && !(existing.note.body ?? '').trim() && !existing.note.properties
  if (existing && !titleOnly) return { file: path, created: false }

  const template = await noteAt(did, 'Templates/routine.org')
  const routine = template ? orgText(template.note).replace(/^#\+title:[^\n]*\n?/, '') : ''
  const { AGENDA_OPTIONS } = await import('./orgAgenda')
  const sched = (await dayAgenda(did, SCHEDULE_FROM, date, date, AGENDA_OPTIONS)).map((e) => `\n** TODO ${e.text}`).join('')
  const text = `#+title: ${date}\n${routine}\n** Scheduled Tasks\n${sched}\n** Notes\n`
  if (existing) await editText(did, path, () => text)
  else await createNote(did, path, text)
  return { file: path, created: true }
}

export type DailyText = { date: string; path: string; exists: boolean; text: string; sha: string | null }

/** A day's daily as org text, for the daily page's editor. */
export async function readDaily(did: string, date: string): Promise<DailyText> {
  const path = dailyPath(date)
  const found = await noteAt(did, path)
  if (!found) return { date, path, exists: false, text: '', sha: null }
  const text = orgText(found.note)
  return { date, path, exists: true, text, sha: textSha(text) }
}

/** Saves a day's daily from the editor; refuses if it changed elsewhere since it was loaded, unless forced. */
export async function saveDaily(did: string, date: string, text: string, expectedSha: string | null, force: boolean): Promise<TextSave> {
  return replaceNoteText(did, dailyPath(date), text, expectedSha, force)
}
