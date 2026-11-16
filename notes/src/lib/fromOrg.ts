/**
 * One .org file → a note record. Shared by the importer and the mirror.
 */
import { fallbackTitle } from './index'
import { parseOrg } from './org'
import { NOTE, type NoteRecord } from './types'

/** When a file was first written, as best the file itself can say. */
export function bornAt(rel: string, created: string | undefined, mtime: number): number {
  const roam = /(?:^|\/)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-[^/]*$/.exec(rel)
  if (roam) return Date.UTC(+roam[1], +roam[2] - 1, +roam[3], +roam[4], +roam[5], +roam[6])
  const daily = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})\.org$/.exec(rel)
  if (daily) return Date.UTC(+daily[1], +daily[2] - 1, +daily[3])
  const c = created && /(\d{4})-(\d{2})-(\d{2})(?:\D+(\d{1,2}):(\d{2}))?/.exec(created)
  if (c) return Date.UTC(+c[1], +c[2] - 1, +c[3], +(c[4] ?? 0), +(c[5] ?? 0))
  return mtime
}

/** The record for a file at `rel` (a relative path) with this text and modification time. */
export function noteFromOrg(rel: string, text: string, mtimeMs: number): { note: NoteRecord; born: number } {
  const parsed = parseOrg(text)
  const created = parsed.properties?.find((p) => p.key.toUpperCase() === 'CREATED')?.value
  const born = bornAt(rel, created, mtimeMs)
  const note: NoteRecord = {
    $type: NOTE,
    title: parsed.title ?? fallbackTitle(rel),
    path: rel,
    ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
    ...(parsed.properties ? { properties: parsed.properties } : {}),
    ...(parsed.body !== undefined ? { body: parsed.body } : {}),
    headings: parsed.headings,
    createdAt: new Date(born).toISOString(),
    updatedAt: new Date(mtimeMs).toISOString(),
  }
  return { note, born }
}
