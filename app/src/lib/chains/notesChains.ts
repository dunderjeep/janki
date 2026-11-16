/**
 * Chain outlines (tasks.org, dough.org) read and edited in notes.
 *
 * The same operations quilt-graph.el offered, with the same rules:
 *   - every heading has a CHAIN_ID, given on first read to any without one;
 *   - ORDERED is inherited, from a parent heading or the note's
 *     `#+PROPERTY: ORDERED t`;
 *   - setting TODO stamps or clears CLOSED, and moves a repeater on, as org-todo does;
 *   - a moved subtree is re-levelled under its new parent.
 *
 * Every edit holds the note locked from read to write (updateNoteAt).
 */
import { randomUUID } from 'node:crypto'
import {
  applyTodo, createNote, getProperty, noteAt, nowStamp, setProperty, subtreeEnd, timestampText, UNCHANGED, updateNoteAt, updateNotesAt,
  type Attachment, type Heading, type NoteRecord,
} from 'notes/server'
import { ChainError } from './errors'
import type { FlatHeading } from './tree'

const CHAIN_ID = 'CHAIN_ID'
const chainId = (h: Heading) => getProperty(h, CHAIN_ID)

/** `#+PROPERTY: ORDERED t` in the note's own text, if any. */
function fileProperty(note: NoteRecord, key: string): string | null {
  for (const line of (note.body ?? '').split('\n')) {
    const m = /^#\+PROPERTY:\s+(\S+)\s*(.*)$/i.exec(line.trim())
    if (m && m[1].toUpperCase() === key) return m[2].trim()
  }
  return null
}

const notNil = (v: string | null) => v !== null && v !== '' && v !== 'nil'

/** Gives a CHAIN_ID to every heading without one. True if any were given. */
function assignIds(note: NoteRecord): boolean {
  let changed = false
  for (const h of note.headings) {
    if (!chainId(h)) {
      setProperty(h, CHAIN_ID, randomUUID())
      changed = true
    }
  }
  return changed
}

function flatten(note: NoteRecord): FlatHeading[] {
  const fileOrdered = fileProperty(note, 'ORDERED')
  const stack: { level: number; ordered: string | null }[] = []
  return note.headings.map((h) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
    const own = getProperty(h, 'ORDERED')
    const inherited = own ?? stack[stack.length - 1]?.ordered ?? fileOrdered
    stack.push({ level: h.level, ordered: inherited })
    const ids = (key: string) => (getProperty(h, key) ?? '').split(/\s+/).filter(Boolean)
    return {
      id: chainId(h)!,
      level: h.level,
      title: h.title,
      todo: h.todo ?? null,
      closed: h.closed ? timestampText(h.closed) : null,
      ordered: notNil(inherited),
      purpose: getProperty(h, 'PURPOSE'),
      signal: getProperty(h, 'SIGNAL'),
      workspace: getProperty(h, 'WORKSPACE'),
      links: ids('LINKS'),
      waits: ids('WAITS'),
      scheduled: h.scheduled ? timestampText(h.scheduled) : null,
      deadline: h.deadline ? timestampText(h.deadline) : null,
      tags: h.tags ?? [],
      effort: getProperty(h, 'EFFORT'),
      energy: getProperty(h, 'ENERGY'),
      waitingOn: getProperty(h, 'WAITING_ON'),
      attachments: (h.attachments ?? []).map((a) => ({
        name: a.name, cid: a.blob.ref.$link, mimeType: a.blob.mimeType, size: a.blob.size, addedAt: a.addedAt,
      })),
    }
  })
}

/** Every heading in the note, in order. Headings without a CHAIN_ID get one, and that is saved. */
export async function readChains(did: string, path: string): Promise<FlatHeading[]> {
  const found = await noteAt(did, path)
  if (!found) throw new ChainError(`No note at ${path}`, 404)
  if (found.note.headings.every((h) => chainId(h))) return flatten(found.note)
  return (await updateNoteAt(did, path, (note) => {
    assignIds(note)
    return flatten(note)
  }))!
}

/** Makes the note from `text` if it does not exist; never overwrites. */
export async function seedChains(did: string, path: string, text: string): Promise<'seeded' | 'exists'> {
  return (await createNote(did, path, text)) ? 'seeded' : 'exists'
}

function locate(note: NoteRecord, id: string): number {
  const i = note.headings.findIndex((h) => chainId(h) === id)
  if (i < 0) throw new ChainError('That heading is no longer there. Reload the page.', 404)
  return i
}

export type Place = 'after' | 'first' | 'last'

/**
 * Adds a heading and returns its CHAIN_ID. `place` is "after" (the next
 * sibling of `anchor`), "first" or "last" (a child of `anchor`). A null anchor
 * adds a top-level heading at the end. `todo` is the keyword, or "" for none.
 */
export async function addHeading(did: string, path: string, anchor: string | null, place: Place, title: string, todo: string): Promise<string> {
  const id = randomUUID()
  await updateNoteAt(did, path, (note) => {
    const hs = note.headings
    const heading = (level: number): Heading => ({
      level, title, ...(todo ? { todo } : {}), properties: [{ key: CHAIN_ID, value: id }],
    })
    if (!anchor) {
      hs.push(heading(1))
      return
    }
    const a = locate(note, anchor)
    const level = hs[a].level
    if (place === 'after') hs.splice(subtreeEnd(hs, a), 0, heading(level))
    else if (place === 'first') hs.splice(a + 1, 0, heading(level + 1))
    else hs.splice(subtreeEnd(hs, a), 0, heading(level + 1))
  })
  return id
}

export type Field =
  | 'todo' | 'title' | 'parked' | 'area' | 'now' | 'snooze' | 'contexts'
  | 'PURPOSE' | 'SIGNAL' | 'ORDERED' | 'WORKSPACE' | 'LINKS' | 'WAITS' | 'EFFORT' | 'ENERGY' | 'WAITING_ON'

/** Turns a tag on or off. */
function setTag(h: Heading, tag: string, on: boolean) {
  const tags = (h.tags ?? []).filter((t) => t !== tag)
  if (on) tags.push(tag)
  if (tags.length) h.tags = tags
  else delete h.tags
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })

/** "YYYY-MM-DD" or "YYYY-MM-DD HH:MM": a day to schedule for, with a time if wanted. */
export const WHEN = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/

/**
 * Schedules a heading (its SCHEDULED) for `when`: a day, or a day and time.
 * A day alone keeps the time and repeater it had; "" removes SCHEDULED.
 */
export function snoozeHeading(h: Heading, when: string) {
  if (!when) {
    delete h.scheduled
    return
  }
  const m = WHEN.exec(when)
  if (!m) throw new ChainError('A day is YYYY-MM-DD, with HH:MM after it for a time')
  h.scheduled = { ...(h.scheduled ?? {}), active: true, date: m[1], day: weekday(m[1]), ...(m[2] ? { time: m[2] } : {}) }
}

/** Applies one field change to a heading. */
export function applyField(h: Heading, field: Field, value: string) {
  if (field === 'todo') applyTodo(h, value)
  else if (field === 'title') h.title = value
  else if (field === 'parked') setTag(h, 'parked', value === 't')
  else if (field === 'now') setTag(h, 'now', value === 't')
  // A list of things (Bills, Tasks), not a project: Next's Projects column leaves it out.
  else if (field === 'area') setTag(h, 'area', value === 't')
  else if (field === 'snooze') snoozeHeading(h, value)
  else if (field === 'contexts') {
    const keep = (h.tags ?? []).filter((t) => !t.startsWith('@'))
    const tags = [...keep, ...value.split(/\s+/).filter(Boolean)]
    if (tags.length) h.tags = tags
    else delete h.tags
  } else setProperty(h, field, value === '' ? null : value)
}

/** Sets one field of heading `id`. "" clears a property or the TODO keyword. */
export async function setField(did: string, path: string, id: string, field: Field, value: string): Promise<'ok'> {
  await updateNoteAt(did, path, (note) => {
    applyField(note.headings[locate(note, id)], field, value)
  })
  return 'ok'
}

/**
 * Moves heading `id` and its subtree from one note to another (or within one),
 * as the last child of `parent`, or at the top level when `parent` is null.
 * `change` edits the moved heading on the way, e.g. to give it a TODO keyword.
 * Both notes are locked and saved together, so the heading is never in both or neither.
 */
export async function refile(
  did: string, from: string, id: string, to: string, parent: string | null, change?: (h: Heading) => void,
): Promise<'ok'> {
  await updateNotesAt(did, [from, to], (notes) => {
    const src = notes[from]
    const i = locate(src, id)
    const moving = src.headings.splice(i, subtreeEnd(src.headings, i) - i)
    const dst = notes[to]
    const hs = dst.headings
    let level = 1
    let at = hs.length
    if (parent) {
      if (moving.some((h) => chainId(h) === parent)) throw new ChainError('A step cannot go inside itself')
      const p = locate(dst, parent)
      level = hs[p].level + 1
      at = subtreeEnd(hs, p)
    }
    const shift = level - moving[0].level
    const moved = moving.map((h) => ({ ...h, level: h.level + shift }))
    change?.(moved[0])
    hs.splice(at, 0, ...moved)
  })
  return 'ok'
}

/** Adds or removes a file attached to heading `id`. */
export async function setAttachments(did: string, path: string, id: string, change: (list: Attachment[]) => Attachment[]): Promise<Attachment[]> {
  return (await updateNoteAt(did, path, (note) => {
    const h = note.headings[locate(note, id)]
    const list = change([...(h.attachments ?? [])])
    if (list.length) h.attachments = list
    else delete h.attachments
    return list
  }))!
}

/**
 * Moves heading `id` (and everything under it) to be child number `index`
 * (from 0) of `parent`, or of the top level when `parent` is null. `index`
 * counts the siblings as they stand once the heading has been lifted out,
 * which is how a dragged list reports it.
 */
export async function moveHeading(did: string, path: string, id: string, parent: string | null, index: number): Promise<'ok'> {
  await updateNoteAt(did, path, (note) => {
    const hs = note.headings
    const from = locate(note, id)
    const moving = hs.splice(from, subtreeEnd(hs, from) - from)
    if (parent && moving.some((h) => chainId(h) === parent)) throw new ChainError('A step cannot go inside itself')

    let level = 1
    let starts: number[]
    let end: number
    if (parent) {
      const p = locate(note, parent)
      level = hs[p].level + 1
      end = subtreeEnd(hs, p)
      starts = []
      for (let i = p + 1; i < end; i++) if (hs[i].level === level) starts.push(i)
    } else {
      end = hs.length
      starts = hs.map((h, i) => (h.level === 1 ? i : -1)).filter((i) => i >= 0)
    }
    const at = index < starts.length ? starts[index] : end
    const shift = level - moving[0].level
    hs.splice(at, 0, ...moving.map((h) => ({ ...h, level: h.level + shift })))
  })
  return 'ok'
}

/** Where deleted headings go, so a delete can be taken back. */
export const TRASH = process.env.NOTES_TRASH ?? 'trash.org'

const trashNote = (): NoteRecord => ({
  $type: 'com.dunderjeep.janki.note', title: 'Trash', path: TRASH, headings: [], createdAt: new Date().toISOString(),
  body: 'Deleted headings, with where they came from. Restore one from Next, or delete it for good.',
})

/**
 * Deletes heading `id` and everything under it, by moving it to the Trash note
 * with where it came from (TRASHED_FROM, TRASHED_PARENT) and when. restoreHeading
 * puts it back.
 */
export async function deleteHeading(did: string, path: string, id: string): Promise<'ok'> {
  await updateNotesAt(did, [path, TRASH], (notes) => {
    const src = notes[path]
    const i = locate(src, id)
    let p = i - 1
    while (p >= 0 && src.headings[p].level >= src.headings[i].level) p--
    const moving = src.headings.splice(i, subtreeEnd(src.headings, i) - i)
    const shift = 1 - moving[0].level
    const moved = moving.map((h) => ({ ...h, level: h.level + shift }))
    setProperty(moved[0], 'TRASHED_FROM', path)
    setProperty(moved[0], 'TRASHED_PARENT', p >= 0 ? chainId(src.headings[p]) : null)
    setProperty(moved[0], 'TRASHED_AT', timestampText(nowStamp()))
    notes[TRASH].headings.push(...moved)
  }, { create: () => trashNote() })
  return 'ok'
}

export type Trashed = { id: string; title: string; from: string; at: string | null; under: number }

/** What is in the Trash, newest first. */
export async function trashList(did: string): Promise<Trashed[]> {
  const found = await noteAt(did, TRASH)
  if (!found) return []
  const hs = found.note.headings
  const out: Trashed[] = []
  hs.forEach((h, i) => {
    if (h.level !== 1) return
    out.push({
      id: chainId(h) ?? '', title: h.title, from: getProperty(h, 'TRASHED_FROM') ?? '', at: getProperty(h, 'TRASHED_AT'),
      under: subtreeEnd(hs, i) - i - 1,
    })
  })
  return out.filter((t) => t.id).reverse()
}

/** Puts a heading back where it was deleted from: under its old parent if that is still there, else at the top level. */
export async function restoreHeading(did: string, id: string): Promise<string> {
  const found = await noteAt(did, TRASH)
  const h = found?.note.headings.find((x) => chainId(x) === id)
  if (!h) throw new ChainError('That is no longer in the Trash', 404)
  const to = getProperty(h, 'TRASHED_FROM')
  if (!to) throw new ChainError('It does not say where it came from')
  const parent = getProperty(h, 'TRASHED_PARENT')
  await updateNotesAt(did, [TRASH, to], (notes) => {
    const src = notes[TRASH]
    const i = locate(src, id)
    const moving = src.headings.splice(i, subtreeEnd(src.headings, i) - i)
    for (const key of ['TRASHED_FROM', 'TRASHED_PARENT', 'TRASHED_AT']) setProperty(moving[0], key, null)
    const dst = notes[to]
    const p = parent ? dst.headings.findIndex((x) => chainId(x) === parent) : -1
    const level = p >= 0 ? dst.headings[p].level + 1 : 1
    const at = p >= 0 ? subtreeEnd(dst.headings, p) : dst.headings.length
    const shift = level - moving[0].level
    dst.headings.splice(at, 0, ...moving.map((x) => ({ ...x, level: x.level + shift })))
  })
  return to
}

/** Removes heading `id` and its subtree outright, not to the Trash: when it lives on elsewhere. */
export async function removeHeading(did: string, path: string, id: string): Promise<void> {
  await updateNoteAt(did, path, (note) => {
    const i = locate(note, id)
    note.headings.splice(i, subtreeEnd(note.headings, i) - i)
  })
}

/** Deletes a heading from the Trash for good. */
export async function purgeHeading(did: string, id: string): Promise<void> {
  await updateNoteAt(did, TRASH, (note) => {
    const i = locate(note, id)
    note.headings.splice(i, subtreeEnd(note.headings, i) - i)
  })
}

export { UNCHANGED }
