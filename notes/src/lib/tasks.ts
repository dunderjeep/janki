/**
 * Tasks over notes: the day agenda, the open-task list, TODO state changes
 * (repeaters included), and small edits a list panel makes: add a task, delete
 * one, tick a checkbox line.
 *
 * Places are given the way the panels have always had them: a note's path and
 * a heading's position (`idx`, 1-based, the same as notes.headings.idx).
 */
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { AppError } from '@janki/app-kit/api'
import { db } from '../host'
import { repeats, toDay, fromDay, DAY } from './dates'
import { DONE_STATES, orgText, parseOrg, parseTimestamp, timestampText } from './org'
import { putNote, UNCHANGED, updateNoteAt } from './store'
import { nextTid } from './tid'
import { NOTE, type Heading, type NoteRecord, type Property, type Timestamp } from './types'

export type DayEntry = {
  heading: string
  /** org-agenda's own line, such as "Scheduled: TODO Pay rent". */
  text: string
  todo: string | null
  /** deadline | upcoming-deadline | past-scheduled | scheduled | timestamp | sexp */
  type: string
  priority: string | null
  time: string | null
  /** The note's path. */
  file: string
  /** The heading's position in the note (0: the note's own text). */
  pos: number
  /** The nearest linkable note or heading, to open on the canvas. */
  node: string | null
}

type Row = {
  path: string
  idx: number
  title: string
  todo: string | null
  done: boolean
  priority: string | null
  scheduled_ts: Timestamp | null
  deadline_ts: Timestamp | null
  body: string
  all_tags: string[]
  node_org_id: string | null
}

async function rowsIn(did: string, paths: string[]): Promise<Row[]> {
  if (!paths.length) return []
  // As JSON: drizzle would expand a JS array into ($1, $2, …), which is not a Postgres array.
  const list = sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(paths)}::jsonb))`
  const { rows } = await db.execute<Row>(sql`
    SELECT r.value->>'path' AS path, h.idx, h.title, h.todo, h.done, h.priority, h.scheduled_ts, h.deadline_ts, h.body, h.all_tags, h.node_org_id
      FROM notes.headings h JOIN notes.records r USING (did, collection, rkey)
     WHERE h.did = ${did} AND r.value->>'path' = ANY(${list})
     ORDER BY array_position(${list}, r.value->>'path'), h.idx`)
  return rows
}

const ACTIVE_TS = /<\d{4}-\d{2}-\d{2}[^>\n]*>/g
const ANNIVERSARY = /^%%\(org-anniversary\s+(\d{4})\s+(\d{1,2})\s+(\d{1,2})\)\s*(.*)$/

function warningDays(ts: Timestamp): number {
  const m = /(\d+)([dwmy])/.exec(ts.warning ?? '')
  return m ? Number(m[1]) * ({ d: 1, w: 7, m: 30, y: 365 } as Record<string, number>)[m[2]] : 14
}

const days = (from: string, to: string) => Math.round((toDay(to) - toDay(from)) / DAY)

/** The org settings that shape a day's agenda, with org's own defaults. */
export type AgendaOptions = {
  /** org-scheduled-past-days: how long an overdue scheduled item keeps showing on today. */
  scheduledPastDays?: number
  /** org-agenda-skip-{scheduled,deadline,timestamp}-if-done. */
  skipDone?: boolean
  /**
   * org-agenda-show-future-repeats: true shows every repeat on later days;
   * 'next' only the first repeat after the timestamp's own date; false none.
   */
  futureRepeats?: boolean | 'next'
}

/**
 * What org-agenda shows for one day across some notes. `today` matters: overdue
 * and upcoming items are only gathered onto today, as org does, and a repeat
 * only lands on a day after today (on today itself, an earlier start is overdue).
 */
export async function dayAgenda(did: string, paths: string[], date: string, today: string,
  { scheduledPastDays = 10000, skipDone = false, futureRepeats = true }: AgendaOptions = {}): Promise<DayEntry[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Dates must be YYYY-MM-DD')
  const out: DayEntry[] = []
  for (const r of await rowsIn(did, paths)) {
    const base = { heading: r.title, todo: r.todo, priority: r.priority, file: r.path, pos: r.idx, node: r.node_org_id }
    const line = (prefix: string) => `${prefix}${r.todo ? `${r.todo} ` : ''}${r.title}`
    if (skipDone && r.done) continue
    const sched = r.scheduled_ts?.active ? r.scheduled_ts : null
    const dl = r.deadline_ts?.active ? r.deadline_ts : null
    /**
     * On `date`, by itself or by a repeat after today. 'next' is the first
     * occurrence on or after today, as org counts it. A scheduled repeat also
     * obeys org-scheduled-past-days, counted from the timestamp's own date.
     */
    const lands = (ts: Timestamp, scheduled: boolean) => {
      if (ts.date === date) return true
      if (date <= today || !futureRepeats) return false
      if (scheduled && days(ts.date, date) > scheduledPastDays) return false
      const all = repeats(ts.date, ts.repeat, date)
      return futureRepeats === 'next' ? all.find((d) => d >= today) === date : all.includes(date)
    }

    if (dl) {
      const late = days(dl.date, date)
      if (lands(dl, false)) out.push({ ...base, type: 'deadline', time: dl.time ?? null, text: line('Deadline: ') })
      else if (date === today && !r.done && late > 0) out.push({ ...base, type: 'deadline', time: null, text: line(`${late} d. ago: `) })
      else if (date === today && !r.done && late < 0 && -late <= warningDays(dl)) out.push({ ...base, type: 'upcoming-deadline', time: null, text: line(`In ${-late} d.: `) })
    }
    if (sched) {
      const late = days(sched.date, date)
      if (lands(sched, true)) {
        // Org calls it overdue on its own day, once that day is past and it is still open.
        const type = sched.date < today && !r.done ? 'past-scheduled' : 'scheduled'
        if (!(r.done && late !== 0)) out.push({ ...base, type, time: sched.time ?? null, text: line('Scheduled: ') })
      } else if (date === today && !r.done && late > 0 && late <= scheduledPastDays) {
        out.push({ ...base, type: 'past-scheduled', time: null, text: line(`Sched.${late}x: `) })
      }
    }
    // Plain active timestamps in the heading or its text: appointments.
    for (const m of `${r.title}\n${r.body}`.matchAll(ACTIVE_TS)) {
      const ts = parseTimestamp(m[0])
      if (ts && lands(ts, false)) {
        out.push({ ...base, type: 'timestamp', time: ts.time ?? null, text: line(ts.time ? `${ts.time} ` : '') })
        break
      }
    }
    // Diary anniversaries: %%(org-anniversary 2006 6 30) Lily is %d
    for (const l of r.body.split('\n')) {
      const a = ANNIVERSARY.exec(l.trim())
      if (!a) continue
      const [y, mo, d] = date.split('-').map(Number)
      if (Number(a[2]) !== mo || Number(a[3]) !== d) continue
      const text = a[4].replace(/%d/g, String(y - Number(a[1])))
      out.push({ ...base, heading: text, todo: null, type: 'sexp', time: null, text })
    }
  }
  const order = ['deadline', 'upcoming-deadline', 'past-scheduled', 'scheduled', 'timestamp', 'sexp']
  return out.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || order.indexOf(a.type) - order.indexOf(b.type))
}

export type OpenTask = {
  heading: string
  todo: string
  priority: string | null
  /** As org writes it: <2026-09-08 Tue +1w>. */
  scheduled: string | null
  deadline: string | null
  tags: string[]
  file: string
  pos: number
  node: string | null
}

/** Every TODO not yet done, in note and outline order. */
export async function openTasks(did: string, paths: string[]): Promise<OpenTask[]> {
  return (await rowsIn(did, paths))
    .filter((r) => r.todo && !r.done)
    .map((r) => ({
      heading: r.title, todo: r.todo!, priority: r.priority,
      scheduled: r.scheduled_ts ? timestampText(r.scheduled_ts) : null,
      deadline: r.deadline_ts ? timestampText(r.deadline_ts) : null,
      tags: r.all_tags, file: r.path, pos: r.idx, node: r.node_org_id,
    }))
}

// ── Editing ───────────────────────────────────────────────────────────────────
//
// Every edit goes through updateNoteAt, which holds the note's row locked from
// read to write, so quick edits in a row queue up rather than overwrite.

type Found = { rkey: string; note: NoteRecord }

/** The note at a path. */
export async function noteAt(did: string, path: string): Promise<Found | null> {
  const { rows: [row] } = await db.execute<{ rkey: string; value: NoteRecord }>(sql`
    SELECT rkey, value FROM notes.records WHERE did = ${did} AND collection = ${NOTE} AND value->>'path' = ${path}`)
  return row ? { rkey: row.rkey, note: row.value } : null
}

/** An inactive timestamp for now, in local time: [2026-11-15 Sun 10:30]. */
export function nowStamp(now = new Date()): Timestamp {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    active: false,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    day: now.toLocaleDateString('en-US', { weekday: 'short' }),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

const localDay = (now: Date) => nowStamp(now).date

/** Sets a property in a heading's drawer, or removes it when `value` is null. */
export function setProperty(h: Heading, key: string, value: string | null) {
  const props: Property[] = h.properties ?? []
  const at = props.findIndex((p) => p.key.toUpperCase() === key.toUpperCase())
  if (value === null) {
    if (at >= 0) props.splice(at, 1)
  } else if (at >= 0) props[at] = { key: props[at].key, value }
  else props.push({ key, value })
  if (props.length) h.properties = props
  else delete h.properties
}

export const getProperty = (h: Heading, key: string) => h.properties?.find((p) => p.key.toUpperCase() === key.toUpperCase())?.value ?? null

const dayName = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

/**
 * The next date of a repeating timestamp, the way org moves it when the task
 * is marked done: +1w adds one step, ++1w steps until it is in the future, and
 * .+1w counts from today.
 */
export function nextRepeat(ts: Timestamp, today: string): Timestamp {
  const m = /^(\.\+|\+\+|\+)(\d+)([hdwmy])/.exec(ts.repeat ?? '')
  if (!m) return ts
  const [, kind, n, unit] = m
  const step = (from: string) => {
    if (unit === 'h') return from
    const d = new Date(`${from}T00:00:00Z`)
    const k = Number(n)
    if (unit === 'd') d.setUTCDate(d.getUTCDate() + k)
    else if (unit === 'w') d.setUTCDate(d.getUTCDate() + 7 * k)
    else if (unit === 'm') d.setUTCMonth(d.getUTCMonth() + k)
    else d.setUTCFullYear(d.getUTCFullYear() + k)
    return fromDay(d.getTime())
  }
  let date = kind === '.+' ? step(today) : step(ts.date)
  if (kind === '++') while (date <= today) date = step(date)
  return { ...ts, date, ...(ts.day ? { day: dayName(date) } : {}) }
}

/**
 * A heading's TODO state, changed the way org-todo changes it. Done on a
 * repeating task moves its dates on and leaves it open, noting LAST_REPEAT.
 * Done on anything else stamps CLOSED; leaving done removes it. "" clears the
 * keyword. Returns the state the heading ends in.
 */
export function applyTodo(h: Heading, state: string, now = new Date()): string {
  const done = DONE_STATES.has(state)
  const repeating = [h.scheduled, h.deadline].some((t) => t?.repeat)
  if (done && repeating) {
    const today = localDay(now)
    if (h.scheduled?.repeat) h.scheduled = nextRepeat(h.scheduled, today)
    if (h.deadline?.repeat) h.deadline = nextRepeat(h.deadline, today)
    setProperty(h, 'LAST_REPEAT', timestampText(nowStamp(now)))
    if (!h.todo || DONE_STATES.has(h.todo)) h.todo = 'TODO'
    return h.todo
  }
  const wasDone = h.todo ? DONE_STATES.has(h.todo) : false
  if (state) h.todo = state
  else delete h.todo
  if (done && !wasDone) h.closed = nowStamp(now)
  else if (!done) delete h.closed
  return h.todo ?? ''
}

/** Sets the TODO state of the heading at `pos` (1-based) in a note. */
export async function setTodo(did: string, path: string, pos: number, state: string, now = new Date()): Promise<string> {
  return (await updateNoteAt(did, path, (note) => {
    const h = note.headings[pos - 1]
    if (!h) throw new AppError('That task is no longer there', 404)
    return applyTodo(h, state, now)
  }))!
}

/** Where heading `i`'s subtree ends: the index of the next heading not below it. */
export function subtreeEnd(hs: Heading[], i: number): number {
  let end = i + 1
  while (end < hs.length && hs[end].level > hs[i].level) end++
  return end
}

const emptyNote = (path: string): NoteRecord => ({
  $type: NOTE, title: path.split('/').pop()!.replace(/\.org$/, ''), path, headings: [], createdAt: new Date().toISOString(),
})

/**
 * Adds a heading at the end of the top-level section titled `under`, making
 * the section (and the note) if they do not exist yet.
 */
export async function addUnder(did: string, path: string, under: string, heading: Omit<Heading, 'level'>): Promise<void> {
  await updateNoteAt(did, path, (note) => {
    const hs = note.headings
    let at = hs.findIndex((h) => h.level === 1 && h.title === under)
    if (at < 0) {
      hs.push({ level: 1, title: under })
      at = hs.length - 1
    }
    hs.splice(subtreeEnd(hs, at), 0, { ...heading, level: 2 })
  }, { create: () => emptyNote(path) })
}

/** Deletes a heading and everything under it. */
export async function deleteSubtree(did: string, path: string, pos: number, expectedTitle?: string): Promise<void> {
  await updateNoteAt(did, path, (note) => {
    const hs = note.headings
    const h = hs[pos - 1]
    if (!h) throw new AppError('That task is no longer there', 404)
    if (expectedTitle !== undefined && h.title !== expectedTitle) throw new AppError('That task moved; reload and try again', 409)
    hs.splice(pos - 1, subtreeEnd(hs, pos - 1) - (pos - 1))
  })
}

/**
 * Edits a note as org text, for list panels that work on checkbox lines.
 * `edit` gets the note's text (what notesUnder() and exportOrg() give) and
 * returns the new text, which is parsed back into the note.
 */
export async function editText(did: string, path: string, edit: (text: string) => string): Promise<void> {
  await updateNoteAt(did, path, (note) => {
    const before = orgText(note)
    const after = edit(before)
    if (after === before) return UNCHANGED
    const p = parseOrg(after)
    note.title = p.title ?? note.title
    for (const [k, v] of [['tags', p.tags], ['properties', p.properties], ['body', p.body]] as const) {
      if (v === undefined) delete note[k]
      else (note as Record<string, unknown>)[k] = v
    }
    note.headings = p.headings
  })
}

/** Makes a note from org text at a path, unless one is there. Returns whether it made one. */
export async function createNote(did: string, path: string, text: string): Promise<boolean> {
  if (await noteAt(did, path)) return false
  const p = parseOrg(text)
  const note: NoteRecord = {
    ...emptyNote(path),
    ...(p.title !== undefined ? { title: p.title } : {}),
    ...(p.tags?.length ? { tags: p.tags } : {}),
    ...(p.properties ? { properties: p.properties } : {}),
    ...(p.body !== undefined ? { body: p.body } : {}),
    headings: p.headings,
  }
  await putNote(did, nextTid(), note)
  return true
}

/** A short fingerprint of a note's text, to tell whether it changed since it was loaded. */
export const textSha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24)

export type TextSave = { ok: true; text: string; sha: string } | { ok: false; text: string; sha: string }

/**
 * Replaces a note's whole content with org `text`, for an editor of the note
 * as text. Refuses (ok: false, with the note as it now is) if the note is no
 * longer what the editor loaded (`expectedSha`), unless `force`. Returns the
 * text as stored, which is the canonical layout of what was sent.
 */
export async function replaceNoteText(did: string, path: string, text: string, expectedSha: string | null, force = false): Promise<TextSave> {
  let out: TextSave | null = null
  await updateNoteAt(did, path, (note) => {
    const current = orgText(note)
    if (!force && expectedSha !== null && textSha(current) !== expectedSha) {
      out = { ok: false, text: current, sha: textSha(current) }
      return UNCHANGED
    }
    if (text === current) {
      out = { ok: true, text: current, sha: textSha(current) }
      return UNCHANGED
    }
    const p = parseOrg(text)
    note.title = p.title ?? note.title
    for (const [k, v] of [['tags', p.tags], ['properties', p.properties], ['body', p.body]] as const) {
      if (v === undefined) delete note[k]
      else (note as Record<string, unknown>)[k] = v
    }
    note.headings = p.headings
    const stored = orgText(note)
    out = { ok: true, text: stored, sha: textSha(stored) }
  })
  return out!
}

export type HeadingHit = {
  /** The note's path. */
  file: string
  /** The heading's CHAIN_ID, if it has one: how chain views find it. */
  chainId: string | null
  title: string
  todo: string | null
  done: boolean
  /** Titles from the note down to the parent. */
  olp: string[]
  /** A little of its text around the first match, when the match is in the text. */
  snippet: string | null
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Headings in some notes whose title or text holds every word of `q`, in part
 * or whole ("dutch" finds "Dutch oven"), title matches first, then open before
 * done. For a search box that answers as you type.
 */
export async function searchHeadings(did: string, q: string, paths: string[], { includeDone = true, limit = 40 } = {}): Promise<HeadingHit[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)
  if (!words.length || !paths.length) return []
  const list = sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(paths)}::jsonb))`
  const each = words.map((w) => sql`(h.title ILIKE ${`%${escapeLike(w)}%`} OR h.body ILIKE ${`%${escapeLike(w)}%`})`)
  const inTitle = words.map((w) => sql`h.title ILIKE ${`%${escapeLike(w)}%`}`)
  const { rows } = await db.execute<{ file: string; chain_id: string | null; title: string; todo: string | null; done: boolean; olp: string[]; body: string; title_hit: boolean }>(sql`
    SELECT r.value->>'path' AS file, h.properties->>'CHAIN_ID' AS chain_id, h.title, h.todo, h.done, h.olp, h.body,
           (${sql.join(inTitle, sql` AND `)}) AS title_hit
      FROM notes.headings h JOIN notes.records r USING (did, collection, rkey)
     WHERE h.did = ${did} AND h.idx > 0 AND r.value->>'path' = ANY(${list})
       AND ${sql.join(each, sql` AND `)}
       ${includeDone ? sql`` : sql`AND NOT h.done`}
     ORDER BY title_hit DESC, h.done, array_position(${list}, r.value->>'path'), h.idx
     LIMIT ${limit}`)
  return rows.map((r) => {
    let snippet: string | null = null
    if (!r.title_hit) {
      const lower = r.body.toLowerCase()
      const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0))
      if (Number.isFinite(at)) {
        const from = Math.max(0, at - 50)
        snippet = (from > 0 ? '…' : '') + r.body.slice(from, at + 110).replace(/\s+/g, ' ').trim() + (at + 110 < r.body.length ? '…' : '')
      }
    }
    return { file: r.file, chainId: r.chain_id, title: r.title, todo: r.todo, done: r.done, olp: r.olp, snippet }
  })
}
