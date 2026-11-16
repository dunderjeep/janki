/**
 * Scatterbrain's linked notes: an item in the binder can be a note from the
 * notes store (the notes/ package), edited here as Markdown.
 *
 * The note is read as org text (orgText) and written back by parsing the new
 * text into the note, under the note's row lock. A save refuses when the note
 * changed since this editor loaded it (another tab, Next, Quilt, the org
 * mirror), unless forced. Paths are note paths, like 'writing/chapter_one.org'.
 */
import { createHash } from 'node:crypto'
import { findNodes, listNotes, noteAt, orgText, parseOrg, searchNotes, UNCHANGED, updateNoteAt, type NoteRecord } from 'notes/server'
import { didForUser } from '@/lib/notesHost'
import { PorcupinError } from '@/lib/porcupin/store'
import { countWords, joinPreamble, markdownToOrg, orgToMarkdown, splitPreamble } from './orgMarkdown'
import type { OrgHit } from './types'

export const sha = (text: string) => createHash('sha256').update(text).digest('hex')

async function didOf(uid: string): Promise<string> {
  const did = await didForUser(uid)
  if (!did) throw new PorcupinError('Link a Bluesky account to use your notes', 403)
  return did
}

function checkPath(path: string) {
  if (typeof path !== 'string' || !path.endsWith('.org') || path.length > 1024 || path.split('/').some((p) => p === '..' || p === '')) {
    throw new PorcupinError('That is not a note', 403)
  }
}

/** Notes whose title or path match first, then notes whose text does; recent notes when nothing is typed. */
export async function searchOrgFiles(uid: string, query: string, limit = 40): Promise<OrgHit[]> {
  const did = await didOf(uid)
  const all = await listNotes(did)
  const byRkey = new Map(all.map((n) => [n.rkey, n]))
  const hit = (rkey: string, snippet: string): OrgHit | null => {
    const n = byRkey.get(rkey)
    return n?.path ? { path: n.path, title: n.title, snippet, modified: new Date(n.updatedAt).toISOString() } : null
  }
  const q = query.trim()
  if (!q) return all.filter((n) => n.path).slice(0, limit).map((n) => hit(n.rkey, '')!)
  const out = new Map<string, OrgHit>()
  const words = q.toLowerCase().split(/\s+/)
  for (const n of all) {
    const name = `${n.path ?? ''} ${n.title}`.toLowerCase()
    if (n.path && words.every((w) => name.includes(w))) out.set(n.path, hit(n.rkey, '')!)
  }
  for (const n of await findNodes(did, q, limit)) {
    const h = hit(n.rkey, n.idx ? n.title : '')
    if (h && !out.has(h.path)) out.set(h.path, h)
  }
  for (const s of await searchNotes(did, q, limit)) {
    const h = hit(s.rkey, s.snippet.replace(/[⟦⟧]/g, ''))
    if (h && !out.has(h.path)) out.set(h.path, h)
  }
  return [...out.values()].slice(0, limit)
}

export type LoadedFile = {
  raw: string
  markdown: string
  sha: string
  title: string | null
  wordCount: number
  /** The note's ID, if it has one: it is then a node in Quilt. */
  nodeId: string | null
}

function load(note: NoteRecord): LoadedFile {
  const raw = orgText(note)
  const { body, title } = splitPreamble(raw)
  const markdown = orgToMarkdown(body)
  return {
    raw,
    markdown,
    sha: sha(raw),
    title,
    wordCount: countWords(markdown),
    nodeId: note.properties?.find((p) => p.key.toUpperCase() === 'ID')?.value ?? null,
  }
}

export async function readOrgFile(uid: string, path: string): Promise<LoadedFile> {
  checkPath(path)
  const found = await noteAt(await didOf(uid), path)
  if (!found) throw new PorcupinError('That note no longer exists', 404)
  return load(found.note)
}

export type SaveRefusal = { conflict: 'changed'; message: string }

/** Replaces a note's content with org `text`, keeping its address, path and creation time. */
function replaceWith(note: NoteRecord, text: string) {
  const p = parseOrg(text)
  note.title = p.title ?? note.title
  for (const [k, v] of [['tags', p.tags], ['properties', p.properties], ['body', p.body]] as const) {
    if (v === undefined) delete note[k]
    else (note as Record<string, unknown>)[k] = v
  }
  note.headings = p.headings
}

/**
 * Writes Markdown back into the note as org. Refuses (unless forced) if the
 * note is no longer the one this editor loaded. `previous` is what it held,
 * for a snapshot.
 */
export async function saveOrgFile(
  uid: string,
  path: string,
  markdown: string,
  expectedSha: string | null,
  force: boolean,
): Promise<SaveRefusal | { sha: string; wordCount: number; previous: string; changed: boolean }> {
  checkPath(path)
  const did = await didOf(uid)
  let refused: SaveRefusal | null = null
  let previous = ''
  let changed = false
  let saved = ''
  await updateNoteAt(did, path, (note) => {
    previous = orgText(note)
    if (!force && expectedSha !== sha(previous)) {
      refused = { conflict: 'changed', message: `${path} changed since it was opened here.` }
      return UNCHANGED
    }
    const { preamble, body } = splitPreamble(previous)
    const next = joinPreamble(preamble, markdownToOrg(markdown, body))
    if (next === previous) {
      saved = previous
      return UNCHANGED
    }
    replaceWith(note, next)
    saved = orgText(note)
    changed = true
  })
  if (refused) return refused
  return { sha: sha(saved), wordCount: countWords(markdown), previous, changed }
}

/** Puts a note's earlier text back, for restoring a snapshot. */
export async function restoreOrgFile(uid: string, path: string, raw: string): Promise<SaveRefusal | { previous: string }> {
  checkPath(path)
  let previous = ''
  await updateNoteAt(await didOf(uid), path, (note) => {
    previous = orgText(note)
    replaceWith(note, raw)
  })
  return { previous }
}
