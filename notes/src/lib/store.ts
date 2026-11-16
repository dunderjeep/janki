/**
 * Notes in Postgres: records in, index rows beside them, queries out.
 *
 * Every function takes the owner's DID first. Records are addressed the ATProto
 * way, at://<did>/com.dunderjeep.janki.note/<rkey>.
 */
import { sql } from 'drizzle-orm'
import { AppError } from '@janki/app-kit/api'
import { db, type NotesDb } from '../host'
import { indexRows } from './index'
import { DAY, repeats, toDay } from './dates'
import { headingsLines, LIST_ITEM, orgText, parseOrg, todoWordsOf } from './org'
import { nextTid, TID } from './tid'
import { NOTE, type NoteRecord, type StoredNote, type Timestamp } from './types'

export const noteUri = (did: string, rkey: string) => `at://${did}/${NOTE}/${rkey}`

type Tx = Parameters<Parameters<NotesDb['transaction']>[0]>[0]

/** Light shape checks: the parts the index relies on. */
function checkNote(value: unknown): NoteRecord {
  const v = value as NoteRecord
  if (!v || typeof v !== 'object') throw new AppError('A note must be an object')
  if (typeof v.title !== 'string') throw new AppError('A note needs a title')
  if (!Array.isArray(v.headings)) throw new AppError('A note needs a list of headings')
  for (const h of v.headings) {
    if (!h || typeof h.title !== 'string' || !Number.isInteger(h.level) || h.level < 1) throw new AppError('Every heading needs a title and a level of 1 or more')
  }
  if (typeof v.createdAt !== 'string' || Number.isNaN(Date.parse(v.createdAt))) throw new AppError('A note needs a createdAt time')
  return { ...v, $type: NOTE }
}

async function writeIndex(tx: Tx, did: string, rkey: string, note: NoteRecord) {
  const { headings, links } = indexRows(note)
  await tx.execute(sql`DELETE FROM notes.headings WHERE did = ${did} AND collection = ${NOTE} AND rkey = ${rkey}`)
  await tx.execute(sql`DELETE FROM notes.links WHERE did = ${did} AND collection = ${NOTE} AND rkey = ${rkey}`)
  await tx.execute(sql`
    INSERT INTO notes.headings (did, collection, rkey, idx, level, org_id, node_org_id, title, todo, done, priority, tags, all_tags, olp,
      scheduled, scheduled_ts, deadline, deadline_ts, closed, properties, body)
    SELECT ${did}, ${NOTE}, ${rkey}, x.idx, x.level, x."orgId", x."nodeOrgId", x.title, x.todo, x.done, x.priority, x.tags, x."allTags", x.olp,
      x.scheduled, x."scheduledTs", x.deadline, x."deadlineTs", x.closed, x.properties, x.body
    FROM jsonb_to_recordset(${JSON.stringify(headings)}::jsonb) AS x(
      idx int, level int, "orgId" text, "nodeOrgId" text, title text, todo text, done boolean, priority text, tags text[], "allTags" text[], olp text[],
      scheduled date, "scheduledTs" jsonb, deadline date, "deadlineTs" jsonb, closed timestamp, properties jsonb, body text)`)
  if (links.length) {
    await tx.execute(sql`
      INSERT INTO notes.links (did, collection, rkey, idx, source_org_id, target_org_id, description, label)
      SELECT ${did}, ${NOTE}, ${rkey}, x.idx, x."sourceOrgId", x."targetOrgId", x.description, x.label
      FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb) AS x(idx int, "sourceOrgId" text, "targetOrgId" text, description text, label text)`)
  }
}

async function writeNote(tx: Tx, did: string, rkey: string, note: NoteRecord) {
  await tx.execute(sql`
    INSERT INTO notes.records (did, collection, rkey, value, created_at, updated_at)
    VALUES (${did}, ${NOTE}, ${rkey}, ${JSON.stringify(note)}::jsonb, ${note.createdAt}::timestamptz, ${note.updatedAt ?? note.createdAt}::timestamptz)
    ON CONFLICT (did, collection, rkey) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
  await writeIndex(tx, did, rkey, note)
}

/** Creates or replaces a note and rebuilds its index, in one transaction. */
export async function putNote(did: string, rkey: string, value: unknown): Promise<StoredNote> {
  if (!TID.test(rkey)) throw new AppError('Not a record key')
  const note = checkNote(value)
  await db.transaction((tx) => writeNote(tx, did, rkey, note))
  return { uri: noteUri(did, rkey), rkey, value: note }
}

/**
 * Reads the note at `path`, lets `change` edit it in place, and saves it, all
 * under a row lock: two quick edits to one note (ticking two boxes, dragging two
 * steps) queue up instead of one overwriting the other. `change` returns
 * whatever the caller wants back, or the symbol UNCHANGED to save nothing.
 * With `create`, a missing note is made from what it returns.
 */
export const UNCHANGED = Symbol('unchanged')

export async function updateNoteAt<T>(
  did: string,
  path: string,
  change: (note: NoteRecord) => T | typeof UNCHANGED | Promise<T | typeof UNCHANGED>,
  { create }: { create?: () => NoteRecord } = {},
): Promise<T | undefined> {
  return db.transaction(async (tx) => {
    const { rows: [row] } = await tx.execute<{ rkey: string; value: NoteRecord }>(sql`
      SELECT rkey, value FROM notes.records
       WHERE did = ${did} AND collection = ${NOTE} AND value->>'path' = ${path} FOR UPDATE`)
    let rkey = row?.rkey
    let note = row?.value
    if (!note) {
      if (!create) throw new AppError(`No note at ${path}`, 404)
      rkey = nextTid()
      note = create()
    }
    const out = await change(note)
    if (out === UNCHANGED && row) return undefined
    const saved = checkNote({ ...note, updatedAt: new Date().toISOString() })
    await writeNote(tx, did, rkey!, saved)
    return out === UNCHANGED ? undefined : out
  })
}

/**
 * updateNoteAt for several notes at once: every row is locked (in path order,
 * so two callers never deadlock) and every note is saved in one transaction.
 * `change` gets the notes by path; a missing one is made with `create` if
 * given, else refused.
 */
export async function updateNotesAt<T>(
  did: string,
  paths: string[],
  change: (notes: Record<string, NoteRecord>) => T | Promise<T>,
  { create }: { create?: (path: string) => NoteRecord } = {},
): Promise<T> {
  const unique = [...new Set(paths)].sort()
  return db.transaction(async (tx) => {
    const found: Record<string, { rkey: string; note: NoteRecord }> = {}
    for (const path of unique) {
      const { rows: [row] } = await tx.execute<{ rkey: string; value: NoteRecord }>(sql`
        SELECT rkey, value FROM notes.records
         WHERE did = ${did} AND collection = ${NOTE} AND value->>'path' = ${path} FOR UPDATE`)
      if (row) found[path] = { rkey: row.rkey, note: row.value }
      else if (create) found[path] = { rkey: nextTid(), note: create(path) }
      else throw new AppError(`No note at ${path}`, 404)
    }
    const out = await change(Object.fromEntries(unique.map((p) => [p, found[p].note])))
    const now = new Date().toISOString()
    for (const path of unique) await writeNote(tx, did, found[path].rkey, checkNote({ ...found[path].note, updatedAt: now }))
    return out
  })
}

/** Rebuilds every index row from the records: after the index gains a column. */
export async function reindexAll(did?: string): Promise<number> {
  const { rows } = await db.execute<{ did: string; rkey: string; value: NoteRecord }>(did
    ? sql`SELECT did, rkey, value FROM notes.records WHERE collection = ${NOTE} AND did = ${did}`
    : sql`SELECT did, rkey, value FROM notes.records WHERE collection = ${NOTE}`)
  for (const r of rows) await db.transaction((tx) => writeIndex(tx, r.did, r.rkey, r.value))
  return rows.length
}

export async function deleteNote(did: string, rkey: string): Promise<{ ok: true }> {
  await db.execute(sql`DELETE FROM notes.records WHERE did = ${did} AND collection = ${NOTE} AND rkey = ${rkey}`)
  return { ok: true }
}

export async function getNote(did: string, rkey: string): Promise<StoredNote> {
  const { rows: [row] } = await db.execute<{ value: NoteRecord }>(sql`
    SELECT value FROM notes.records WHERE did = ${did} AND collection = ${NOTE} AND rkey = ${rkey}`)
  if (!row) throw new AppError('Not found', 404)
  return { uri: noteUri(did, rkey), rkey, value: row.value }
}

/** The rkey each path already has, so a re-import replaces notes instead of duplicating them. */
export async function rkeysByPath(did: string): Promise<Map<string, string>> {
  const { rows } = await db.execute<{ rkey: string; path: string }>(sql`
    SELECT rkey, value->>'path' AS path FROM notes.records WHERE did = ${did} AND collection = ${NOTE} AND value ? 'path'`)
  return new Map(rows.map((r) => [r.path, r.rkey]))
}

/** The note as an .org file. */
export async function exportOrg(did: string, rkey: string): Promise<{ path: string; text: string }> {
  const { value } = await getNote(did, rkey)
  return { path: value.path ?? `${rkey}.org`, text: orgText(value) }
}

export type NoteSummary = { uri: string; rkey: string; title: string; path: string | null; tags: string[]; updatedAt: string }

export async function listNotes(did: string): Promise<NoteSummary[]> {
  const { rows } = await db.execute<{ rkey: string; title: string; path: string | null; tags: string[] | null; updated_at: string }>(sql`
    SELECT rkey, value->>'title' AS title, value->>'path' AS path,
           ARRAY(SELECT jsonb_array_elements_text(COALESCE(value->'tags', '[]'))) AS tags, updated_at
      FROM notes.records WHERE did = ${did} AND collection = ${NOTE} ORDER BY updated_at DESC`)
  return rows.map((r) => ({ uri: noteUri(did, r.rkey), rkey: r.rkey, title: r.title, path: r.path, tags: r.tags ?? [], updatedAt: r.updated_at }))
}

/** One heading (or a note's own row 0), as found by a lookup. */
export type NodeHit = {
  uri: string
  rkey: string
  idx: number
  orgId: string | null
  level: number
  title: string
  olp: string[]
  tags: string[]
  todo: string | null
}

type HeadingDbRow = { rkey: string; idx: number; org_id: string | null; level: number; title: string; olp: string[]; all_tags: string[]; todo: string | null }

const hit = (did: string) => (r: HeadingDbRow): NodeHit => ({
  uri: noteUri(did, r.rkey), rkey: r.rkey, idx: r.idx, orgId: r.org_id, level: r.level, title: r.title, olp: r.olp, tags: r.all_tags, todo: r.todo,
})

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Find a note or linkable heading by name as you type, the way org-roam-node-find
 * does: prefix matches first, then anything containing the words, then near
 * misses by trigram similarity.
 */
export async function findNodes(did: string, q: string, limit = 30): Promise<NodeHit[]> {
  const query = q.trim()
  if (!query) {
    const { rows } = await db.execute<HeadingDbRow>(sql`
      SELECT h.rkey, h.idx, h.org_id, h.level, h.title, h.olp, h.all_tags, h.todo
        FROM notes.headings h JOIN notes.records r USING (did, collection, rkey)
       WHERE h.did = ${did} AND h.idx = 0 ORDER BY r.updated_at DESC LIMIT ${limit}`)
    return rows.map(hit(did))
  }
  const like = `%${likeEscape(query)}%`
  const prefix = `${likeEscape(query)}%`
  const { rows } = await db.execute<HeadingDbRow>(sql`
    SELECT rkey, idx, org_id, level, title, olp, all_tags, todo
      FROM notes.headings
     WHERE did = ${did} AND (org_id IS NOT NULL OR idx = 0)
       AND (title ILIKE ${like} OR title % ${query})
     ORDER BY (title ILIKE ${prefix}) DESC, (title ILIKE ${like}) DESC, similarity(title, ${query}) DESC, length(title)
     LIMIT ${limit}`)
  return rows.map(hit(did))
}

export type SearchHit = NodeHit & { snippet: string; rank: number }

/**
 * Full-text search over every heading's title and text. Words are stemmed in
 * English, and titles also match word for word. In the snippet, matches sit
 * between ⟦ and ⟧.
 */
export async function searchNotes(did: string, q: string, limit = 50): Promise<SearchHit[]> {
  if (!q.trim()) return []
  const { rows } = await db.execute<HeadingDbRow & { snippet: string; rank: number }>(sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${q}) || websearch_to_tsquery('simple', ${q}) AS tsq),
    hits AS (
      SELECT h.*, ts_rank(h.search, q.tsq) AS rank
        FROM notes.headings h, q
       WHERE h.did = ${did} AND h.search @@ q.tsq
       ORDER BY rank DESC LIMIT ${limit})
    SELECT rkey, idx, org_id, level, title, olp, all_tags, todo, rank,
           ts_headline('english', body, q.tsq, 'StartSel=⟦, StopSel=⟧, MaxFragments=2, MinWords=6, MaxWords=20, FragmentDelimiter= … ') AS snippet
      FROM hits, q ORDER BY rank DESC`)
  return rows.map((r) => ({ ...hit(did)(r), snippet: r.snippet, rank: r.rank }))
}

export type NodeDetail = NodeHit & {
  note: StoredNote
  backlinks: (NodeHit & { description: string | null })[]
  links: { orgId: string; title: string | null; description: string | null }[]
}

/** A linkable heading or note by its org ID, with the note it is in and what links to it. */
export async function nodeById(did: string, id: string): Promise<NodeDetail> {
  const { rows: [row] } = await db.execute<HeadingDbRow>(sql`
    SELECT rkey, idx, org_id, level, title, olp, all_tags, todo FROM notes.headings
     WHERE did = ${did} AND org_id = ${id} ORDER BY idx LIMIT 1`)
  if (!row) throw new AppError('Not found', 404)
  const [note, back, forward] = await Promise.all([
    getNote(did, row.rkey),
    db.execute<HeadingDbRow & { description: string | null }>(sql`
      SELECT DISTINCT ON (s.rkey, s.idx) s.rkey, s.idx, s.org_id, s.level, s.title, s.olp, s.all_tags, s.todo, l.description
        FROM notes.links l
        JOIN notes.headings s ON s.did = l.did AND s.org_id = l.source_org_id
       WHERE l.did = ${did} AND l.target_org_id = ${id}
       ORDER BY s.rkey, s.idx`),
    db.execute<{ org_id: string; title: string | null; description: string | null }>(sql`
      SELECT DISTINCT ON (l.target_org_id) l.target_org_id AS org_id, t.title, l.description
        FROM notes.links l
        LEFT JOIN notes.headings t ON t.did = l.did AND t.org_id = l.target_org_id
       WHERE l.did = ${did} AND l.source_org_id = ${id}
       ORDER BY l.target_org_id`),
  ])
  return {
    ...hit(did)(row),
    note,
    backlinks: back.rows.map((r) => ({ ...hit(did)(r), description: r.description })),
    links: forward.rows.map((r) => ({ orgId: r.org_id, title: r.title, description: r.description })),
  }
}

export type GraphNode = {
  id: string
  title: string
  rkey: string
  idx: number
  level: number
  /** The note's path, such as 'daily/2026-11-15.org'. */
  path: string | null
  tags: string[]
  todo: string | null
  scheduled: string | null
  deadline: string | null
}

export type Graph = {
  nodes: GraphNode[]
  /** One edge per linked pair, carrying the first label written for it. */
  edges: { source: string; target: string; label: string | null }[]
}

/** Every linkable note and heading, and the links between them that resolve at both ends. */
export async function graph(did: string): Promise<Graph> {
  const [nodes, edges] = await Promise.all([
    db.execute<HeadingDbRow & { path: string | null; scheduled: string | null; deadline: string | null }>(sql`
      SELECT DISTINCT ON (h.org_id) h.rkey, h.idx, h.org_id, h.level, h.title, h.olp, h.all_tags, h.todo,
             r.value->>'path' AS path, to_char(h.scheduled, 'YYYY-MM-DD') AS scheduled, to_char(h.deadline, 'YYYY-MM-DD') AS deadline
        FROM notes.headings h JOIN notes.records r USING (did, collection, rkey)
       WHERE h.did = ${did} AND h.org_id IS NOT NULL ORDER BY h.org_id, h.idx`),
    db.execute<{ source: string; target: string; label: string | null }>(sql`
      SELECT l.source_org_id AS source, l.target_org_id AS target,
             (array_agg(l.label ORDER BY l.rkey, l.idx) FILTER (WHERE l.label IS NOT NULL))[1] AS label
        FROM notes.links l
       WHERE l.did = ${did} AND l.source_org_id IS NOT NULL AND l.source_org_id <> l.target_org_id
         AND EXISTS (SELECT 1 FROM notes.headings t WHERE t.did = l.did AND t.org_id = l.target_org_id)
       GROUP BY 1, 2`),
  ])
  return {
    nodes: nodes.rows.map((r) => ({
      id: r.org_id!, title: r.title, rkey: r.rkey, idx: r.idx, level: r.level, path: r.path,
      tags: r.all_tags, todo: r.todo, scheduled: r.scheduled, deadline: r.deadline,
    })),
    edges: edges.rows,
  }
}

/** The org IDs a note links to, by the note's path. A missing note links to nothing. */
export async function linkedIdsIn(did: string, path: string): Promise<string[]> {
  const { rows } = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT l.target_org_id AS id
      FROM notes.links l JOIN notes.records r USING (did, collection, rkey)
     WHERE l.did = ${did} AND r.value->>'path' = ${path}`)
  return rows.map((r) => r.id)
}

/** Notes whose path starts with `prefix`, as org text, newest path first. */
export async function notesUnder(did: string, prefix: string, limit = 10_000): Promise<{ rkey: string; path: string; text: string }[]> {
  const { rows } = await db.execute<{ rkey: string; value: NoteRecord }>(sql`
    SELECT rkey, value FROM notes.records
     WHERE did = ${did} AND collection = ${NOTE} AND starts_with(value->>'path', ${prefix})
     ORDER BY value->>'path' DESC LIMIT ${limit}`)
  return rows.map((r) => ({ rkey: r.rkey, path: r.value.path!, text: orgText(r.value) }))
}

// ── A node's own text, for the note card ───────────────────────────────────────
//
// A node's text is everything under its heading line, its planning and its
// property drawer: its body and every heading below it. For a note (row 0) it is
// everything after the drawer and the #+ keywords. The ID lives in the drawer,
// which the card never offers, so a stray keystroke can't cut a note loose from
// its links and its place on the canvas.

type Located = { rkey: string; idx: number; note: NoteRecord; /** headings[from, to) are the node's subtree below it. */ from: number; to: number }

async function locate(did: string, id: string): Promise<Located> {
  const { rows: [row] } = await db.execute<{ rkey: string; idx: number }>(sql`
    SELECT rkey, idx FROM notes.headings WHERE did = ${did} AND org_id = ${id} ORDER BY idx LIMIT 1`)
  if (!row) throw new AppError('No note has that ID', 404)
  const { value: note } = await getNote(did, row.rkey)
  if (row.idx === 0) return { rkey: row.rkey, idx: 0, note, from: 0, to: note.headings.length }
  const level = note.headings[row.idx - 1].level
  let to = row.idx
  while (to < note.headings.length && note.headings[to].level > level) to++
  return { rkey: row.rkey, idx: row.idx, note, from: row.idx, to }
}

const ownBody = (l: Located) => (l.idx === 0 ? l.note.body : l.note.headings[l.idx - 1].body)

function textOf(l: Located): string {
  const parts = [ownBody(l), ...headingsLines(l.note.headings.slice(l.from, l.to))].filter((p): p is string => p !== undefined)
  return parts.join('\n')
}

export async function nodeText(did: string, id: string): Promise<{ rkey: string; path: string | null; text: string }> {
  const l = await locate(did, id)
  return { rkey: l.rkey, path: l.note.path ?? null, text: textOf(l) }
}

async function save(did: string, l: Located): Promise<void> {
  await putNote(did, l.rkey, { ...l.note, updatedAt: new Date().toISOString() })
}

/**
 * Replaces a node's text, if it still reads `expected`: what the card showed
 * when editing began. Otherwise nothing is written, because one of two edits
 * would be lost without anyone seeing it.
 */
export async function setNodeText(did: string, id: string, expected: string, text: string): Promise<{ ok: true }> {
  const l = await locate(did, id)
  if (textOf(l) !== expected) throw new AppError('This note changed since the card opened. Reload it.', 409)
  const parsed = parseOrg(text, { fragment: true, todo: todoWordsOf(l.note.body) })
  const body = text === '' ? undefined : parsed.body
  if (l.idx === 0) {
    l.note.body = body
    l.note.headings = parsed.headings
  } else {
    const own = l.note.headings[l.idx - 1]
    const outside = parsed.headings.find((h) => h.level <= own.level)
    if (outside) throw new AppError(`A heading here needs more than ${own.level} star${own.level === 1 ? '' : 's'}, or it would leave this note: "${outside.title}"`)
    if (body === undefined) delete own.body
    else own.body = body
    l.note.headings.splice(l.from, l.to - l.from, ...parsed.headings)
  }
  await save(did, l)
  return { ok: true }
}

/**
 * Makes `source`'s link to `dest` carry `label`, writing the link if there is none.
 *
 * The link is looked for in the source's text. If it sits on a list item, the
 * term is set in place (an empty label removes it). Otherwise (no link yet, or
 * one in the middle of a sentence, where no term fits) a new item goes at the
 * end of the source's own text. A sentence is never rewritten to fit a label;
 * a duplicate link costs nothing, because the canvas draws one edge per pair.
 */
export async function labelLink(did: string, source: string, dest: string, label: string, title: string): Promise<'relabelled' | 'created'> {
  const term = label.trim()
  if (term.length > 60 || /[\n\r]|::/.test(term)) throw new AppError('A label is one short line without "::"')
  if (source === dest) throw new AppError('A note cannot link to itself')
  const l = await locate(did, source)
  const needle = `[[id:${dest}]`

  const bodies: { get: () => string | undefined; set: (v: string) => void }[] = [
    l.idx === 0
      ? { get: () => l.note.body, set: (v) => { l.note.body = v } }
      : { get: () => l.note.headings[l.idx - 1].body, set: (v) => { l.note.headings[l.idx - 1].body = v } },
    ...l.note.headings.slice(l.from, l.to).map((h) => ({ get: () => h.body, set: (v: string) => { h.body = v } })),
  ]
  for (const b of bodies) {
    const lines = (b.get() ?? '').split('\n')
    const at = lines.findIndex((line) => line.includes(needle) && LIST_ITEM.test(line))
    if (at < 0) continue
    lines[at] = lines[at].replace(LIST_ITEM, (_all, bullet: string) => (term ? `${bullet}${term} :: ` : bullet))
    b.set(lines.join('\n'))
    await save(did, l)
    return 'relabelled'
  }

  const { rows: [target] } = await db.execute<{ title: string }>(sql`
    SELECT title FROM notes.headings WHERE did = ${did} AND org_id = ${dest} ORDER BY idx LIMIT 1`)
  const name = (target?.title ?? title).replace(/[[\]]/g, '')
  const item = `- ${term ? `${term} :: ` : ''}[[id:${dest}][${name}]]`
  // Tight against the note's last text, not after its blank lines, so repeated additions make one list.
  const current = bodies[0].get() ?? ''
  const [, head, tail] = /^([\s\S]*?)(\s*)$/.exec(current)!
  bodies[0].set(head ? `${head}\n${item}${tail}` : `${item}${tail || ''}`)
  await save(did, l)
  return 'created'
}

export type AgendaEntry = NodeHit & {
  kind: 'scheduled' | 'deadline'
  /** The day it shows on: the timestamp's date, or a later repeat of it. */
  date: string
  time: string | null
  repeat: string | null
  /** Days past due, for a scheduled or deadline date before `from`. */
  overdue: number
  priority: string | null
}

/**
 * The open items that fall between two days, org-agenda style: active
 * SCHEDULED and DEADLINE dates in range (and their repeats), anything still
 * open from before `from` as overdue, and deadlines coming up within their
 * warning period (14 days unless the timestamp says otherwise).
 */
export async function agenda(did: string, from: string, to: string): Promise<AgendaEntry[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new AppError('Dates must be YYYY-MM-DD')
  const { rows } = await db.execute<HeadingDbRow & { priority: string | null; scheduled_ts: Timestamp | null; deadline_ts: Timestamp | null }>(sql`
    SELECT rkey, idx, org_id, level, title, olp, all_tags, todo, priority, scheduled_ts, deadline_ts
      FROM notes.headings
     WHERE did = ${did} AND NOT done
       AND (scheduled <= ${to}::date OR deadline <= (${to}::date + 365))`)
  const out: AgendaEntry[] = []
  const fromMs = toDay(from)
  const toMs = toDay(to)
  for (const r of rows) {
    for (const kind of ['scheduled', 'deadline'] as const) {
      const ts = kind === 'scheduled' ? r.scheduled_ts : r.deadline_ts
      if (!ts?.active) continue
      const base = { ...hit(did)(r), kind, time: ts.time ?? null, repeat: ts.repeat ?? null, priority: r.priority }
      const at = toDay(ts.date)
      if (at < fromMs) {
        out.push({ ...base, date: from, overdue: Math.round((fromMs - at) / DAY) })
        continue
      }
      if (kind === 'deadline' && at > toMs) {
        const warn = /(\d+)([dwmy])/.exec(ts.warning ?? '')
        const days = warn ? Number(warn[1]) * ({ d: 1, w: 7, m: 30, y: 365 } as Record<string, number>)[warn[2]] : 14
        // Shown on the first day of the range, the way org shows it on today.
        if (at - toMs <= days * DAY) out.push({ ...base, date: from, overdue: 0 })
        continue
      }
      for (const date of repeats(ts.date, ts.repeat, to)) {
        if (toDay(date) >= fromMs) out.push({ ...base, date, overdue: 0 })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || b.overdue - a.overdue)
}
