/**
 * Notes' HTTP API. A host mounts it at /api/notes/[...path]:
 *
 *   export { GET, POST, PUT, PATCH, DELETE } from 'notes/api'
 *
 * Every call runs as the host's current DID.
 */
import { AppError, createApi, type Route } from '@janki/app-kit/api'
import { notesHost } from './host'
import { agenda, deleteNote, exportOrg, findNodes, getNote, graph, listNotes, nodeById, putNote, searchNotes } from './lib/store'
import { nextTid } from './lib/tid'

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const limit = (v: string | null, max: number, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback
}

const routes: Route[] = [
  // Find by name as you type; empty q lists recent notes.
  ['GET', 'find', async ({ uid, q }) => ({ hits: await findNodes(uid, q.get('q') ?? '', limit(q.get('limit'), 100, 30)) })],
  // Full-text search across every heading.
  ['GET', 'search', async ({ uid, q }) => ({ hits: await searchNotes(uid, q.get('q') ?? '', limit(q.get('limit'), 200, 50)) })],
  ['GET', 'notes', async ({ uid }) => ({ notes: await listNotes(uid) })],
  ['POST', 'notes', async ({ uid, body }) => putNote(uid, nextTid(), { createdAt: new Date().toISOString(), ...(await body()) })],
  ['GET', 'notes/:rkey', async ({ uid, p }) => getNote(uid, p.rkey)],
  ['PUT', 'notes/:rkey', async ({ uid, p, body }) => {
    const value = await body()
    return putNote(uid, p.rkey, { ...value, updatedAt: new Date().toISOString() })
  }],
  ['DELETE', 'notes/:rkey', async ({ uid, p }) => deleteNote(uid, p.rkey)],
  // The note as an .org file, for export.
  ['GET', 'notes/:rkey/org', async ({ uid, p }) => {
    const { path, text } = await exportOrg(uid, p.rkey)
    const name = path.split('/').pop() ?? 'note.org'
    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"` },
    })
  }],
  // A linkable heading or note by its org ID, with backlinks.
  ['GET', 'nodes/:id', async ({ uid, p }) => nodeById(uid, p.id)],
  ['GET', 'graph', async ({ uid }) => graph(uid)],
  // ?from=YYYY-MM-DD&days=7 (defaults: today, 7 days)
  ['GET', 'agenda', async ({ uid, q }) => {
    const from = q.get('from') ?? today()
    const days = limit(q.get('days'), 366, 7)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new AppError('from must be YYYY-MM-DD')
    const to = addDays(from, days - 1)
    return { from, to, entries: await agenda(uid, from, to) }
  }],
]

export const { GET, POST, PUT, PATCH, DELETE } = createApi('notes', notesHost, routes)
