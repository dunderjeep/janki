/**
 * The one-way mirror from a folder of .org files into notes, for the
 * changeover from Emacs. Files flow in; notes are never written back to files.
 *
 * Each sync compares every file with what the last sync saw (notes.mirror):
 *   - a new or changed file is imported, under its note's existing rkey;
 *   - a file that is gone takes its note with it;
 *   - but a note that was edited in janki since the last sync is left alone,
 *     whatever happened to its file, and reported as a conflict, so neither
 *     edit is lost without anyone seeing it.
 *
 * Server-only (it reads the file system). Exported as 'notes/mirror'.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from './host'
import { noteFromOrg } from './lib/fromOrg'
import { deleteNote, putNote } from './lib/store'
import { tidFor } from './lib/tid'
import { NOTE } from './lib/types'

const SKIPPED = new Set(['.git', 'node_modules', '.stversions', 'ltximg'])
/** Org files only: not Emacs's #autosave#, .#lock or backup~ files, nor hidden ones. */
export const isOrgName = (n: string) => n.endsWith('.org') && !/^(#|\.#|\.)/.test(n) && !n.endsWith('~')

export async function* orgFiles(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIPPED.has(e.name) && !e.name.startsWith('.')) yield* orgFiles(path.join(dir, e.name))
    } else if (e.isFile() && isOrgName(e.name)) yield path.join(dir, e.name)
  }
}

export type SyncResult = {
  imported: string[]
  deleted: string[]
  /** Paths whose note was edited in janki since the last sync; their file was not imported. */
  conflicts: string[]
  unchanged: number
  ms: number
}

export async function syncOrgDir(did: string, root: string, { dryRun = false } = {}): Promise<SyncResult> {
  const t0 = performance.now()
  const files = new Map<string, { abs: string; mtime: number }>()
  for await (const abs of orgFiles(root)) {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    files.set(rel, { abs, mtime: (await stat(abs)).mtimeMs })
  }
  // A folder that is suddenly empty is far likelier unmounted than emptied.
  if (!files.size) throw new Error(`No .org files under ${root}; not syncing`)

  const [mirrored, records] = await Promise.all([
    db.execute<{ path: string; rkey: string; mtime_ms: number; synced_at: string }>(sql`
      SELECT path, rkey, mtime_ms, synced_at FROM notes.mirror WHERE did = ${did}`),
    db.execute<{ path: string; rkey: string; updated_at: string }>(sql`
      SELECT value->>'path' AS path, rkey, updated_at FROM notes.records
       WHERE did = ${did} AND collection = ${NOTE} AND value ? 'path'`),
  ])
  const seen = new Map(mirrored.rows.map((r) => [r.path, r]))
  const notes = new Map(records.rows.map((r) => [r.path, r]))
  const taken = new Set(records.rows.map((r) => r.rkey))
  const result: SyncResult = { imported: [], deleted: [], conflicts: [], unchanged: 0, ms: 0 }

  /** Edited in janki since the file was last brought in. */
  const editedHere = (p: string, fileMtime: number) => {
    const note = notes.get(p)
    if (!note) return false
    const row = seen.get(p)
    const since = row ? Date.parse(row.synced_at) : fileMtime + 1000
    return Date.parse(note.updated_at) > since
  }

  for (const [rel, f] of files) {
    const row = seen.get(rel)
    if (row && row.mtime_ms === f.mtime) {
      result.unchanged++
      continue
    }
    if (editedHere(rel, f.mtime)) {
      result.conflicts.push(rel)
      continue
    }
    const { note, born } = noteFromOrg(rel, await readFile(f.abs, 'utf8'), f.mtime)
    const rkey = notes.get(rel)?.rkey ?? tidFor(born, taken)
    if (!dryRun) {
      await putNote(did, rkey, note)
      await db.execute(sql`
        INSERT INTO notes.mirror (did, path, rkey, mtime_ms, synced_at) VALUES (${did}, ${rel}, ${rkey}, ${f.mtime}, now())
        ON CONFLICT (did, path) DO UPDATE SET rkey = excluded.rkey, mtime_ms = excluded.mtime_ms, synced_at = now()`)
    }
    result.imported.push(rel)
  }

  for (const [rel, row] of seen) {
    if (files.has(rel)) continue
    if (editedHere(rel, row.mtime_ms)) {
      result.conflicts.push(rel)
      continue
    }
    if (!dryRun) {
      if (notes.get(rel)?.rkey === row.rkey) await deleteNote(did, row.rkey)
      await db.execute(sql`DELETE FROM notes.mirror WHERE did = ${did} AND path = ${rel}`)
    }
    result.deleted.push(rel)
  }
  result.ms = Math.round(performance.now() - t0)
  return result
}
