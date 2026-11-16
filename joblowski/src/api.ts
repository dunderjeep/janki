/**
 * Joblowski's HTTP API, as one dispatcher. A host mounts it with a single
 * catch-all route at /api/joblowski/[...path] and exports these handlers:
 *
 *   export { GET, POST, PUT, PATCH, DELETE } from 'joblowski/api'
 *
 * Every call runs as the host's current user; refusals (JoblowskiError) become
 * their HTTP status, anything else a 500.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, joblowskiHost } from './host'
import { joblowskiDocuments } from './schema'
import { addFact, applyProposal, deleteFact, getChat, listFacts, sendChat, updateFact } from './lib/chat'
import { deleteWalk, getHome, listWalks, planWalk, saveWalk, setHome, updateWalk } from './lib/map'
import { htmlToPdf, pdfResponse } from './lib/pdf'
import { getRates, setRates } from './lib/rates'
import { renderPage } from './lib/render'
import {
  checkAlertsFor, createSaved, deleteSaved, dismiss, listSaved, markAllSeen, newHits, readQuery,
  reorderSaved, restore, search, sourceStatus, unseenCount, updateSaved,
} from './lib/search'
import {
  createApplication, createBoard, createDocument, deleteApplication, deleteBoard, deleteDocument, deleteNote,
  draftForApplication, getDocument, JoblowskiError, listApplications, listBoards, listDocuments, logNote, reorderBoards,
  restoreBoards, revisionBody, saveDocument, saveVersion, tailorDocument, unparkApplication, updateApplication, updateBoard,
} from './lib/store'
import { suggestSearches } from './lib/suggest'
import { describeFilters, type DocKind, type DocStyle } from './lib/types'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Ctx = { uid: string; req: NextRequest; p: Record<string, string>; body: () => Promise<Record<string, unknown>> }
type Handler = (c: Ctx) => Promise<Response | object>

/** Longest a host should let one call run: drafting with Claude is the slow one. */
export const maxDuration = 300

const routes: [Method, string, Handler][] = [
  // Alerts and saved searches
  ['GET', 'alerts/count', async ({ uid }) => ({ unseen: await unseenCount(uid) })],
  ['GET', 'alerts', async ({ uid }) => ({ hits: await newHits(uid), saved: await listSaved(uid), status: await sourceStatus() })],
  ['POST', 'alerts', async ({ uid, body }) => {
    const b = await body()
    if (b.action === 'seen') return markAllSeen(uid)
    if (b.action === 'dismiss') return dismiss(uid, String(b.listingId ?? ''))
    if (b.action === 'restore') return restore(uid, String(b.listingId ?? ''))
    if (b.action === 'check') {
      const result = await checkAlertsFor(uid)
      return { ...result, hits: await newHits(uid), saved: await listSaved(uid), status: await sourceStatus() }
    }
    throw new JoblowskiError('Unknown action')
  }],
  ['POST', 'search', async ({ uid, body }) => search(uid, readQuery(await body()))],
  ['GET', 'saved', async ({ uid }) => ({ saved: await listSaved(uid) })],
  ['POST', 'saved', async ({ uid, body }) => {
    const b = await body()
    const query = readQuery(b)
    if (!query.query && !query.location) throw new JoblowskiError('Enter some words or a place to search for')
    const name = String(b.name ?? '').trim().slice(0, 120) || [query.query, query.location, describeFilters(query.filters)].filter(Boolean).join(' · ')
    return createSaved(uid, { name, ...query, alert: b.alert !== false })
  }],
  // The ladder's order: ids from the narrowest search to the broadest.
  ['PATCH', 'saved', async ({ uid, body }) => reorderSaved(uid, (await body()).order)],
  ['POST', 'saved/suggest', async ({ uid }) => ({ searches: await suggestSearches(uid) })],
  ['PATCH', 'saved/:id', async ({ uid, p, body }) => updateSaved(uid, p.id, Boolean((await body()).alert))],
  ['DELETE', 'saved/:id', async ({ uid, p }) => deleteSaved(uid, p.id)],

  // Tracker
  ['GET', 'applications', async ({ uid }) => ({ applications: await listApplications(uid) })],
  ['POST', 'applications', async ({ uid, body }) => createApplication(uid, await body())],
  // Unparking returns to the status the job had before, which only the server knows.
  ['PATCH', 'applications/:id', async ({ uid, p, body }) => {
    const b = await body()
    return b.unpark ? unparkApplication(uid, p.id) : updateApplication(uid, p.id, b)
  }],
  ['DELETE', 'applications/:id', async ({ uid, p }) => deleteApplication(uid, p.id)],
  ['POST', 'applications/:id/draft', async ({ uid, p, body }) => draftForApplication(uid, p.id, await body())],
  ['POST', 'applications/:id/tailor', async ({ uid, p, body }) => tailorDocument(uid, p.id, await body())],
  // A note in the job's history, dated the day it happened.
  ['POST', 'applications/:id/log', async ({ uid, p, body }) => logNote(uid, p.id, await body())],
  ['DELETE', 'applications/:id/log', async ({ uid, p, body }) => deleteNote(uid, p.id, String((await body()).eventId ?? ''))],

  // Boards
  ['GET', 'boards', async ({ uid }) => ({ boards: await listBoards(uid) })],
  ['POST', 'boards', async ({ uid, body }) => createBoard(uid, await body())],
  ['PUT', 'boards/order', async ({ uid, body }) => reorderBoards(uid, await body())],
  ['POST', 'boards/restore', async ({ uid }) => restoreBoards(uid)],
  ['PATCH', 'boards/:id', async ({ uid, p, body }) => updateBoard(uid, p.id, await body())],
  ['DELETE', 'boards/:id', async ({ uid, p }) => deleteBoard(uid, p.id)],

  // Résumés and letters
  ['GET', 'documents', async ({ uid }) => ({ documents: await listDocuments(uid) })],
  ['POST', 'documents', async ({ uid, body }) => createDocument(uid, await body())],
  ['GET', 'documents/:id', async ({ uid, p }) => getDocument(uid, p.id)],
  ['PATCH', 'documents/:id', async ({ uid, p, body }) => saveDocument(uid, p.id, await body())],
  ['DELETE', 'documents/:id', async ({ uid, p }) => deleteDocument(uid, p.id)],
  ['POST', 'documents/:id/versions', async ({ uid, p, body }) => saveVersion(uid, p.id, (await body()).label)],
  ['GET', 'documents/:id/pdf', async ({ uid, p }) => {
    const doc = await getDocument(uid, p.id)
    return pdfResponse(await htmlToPdf(renderPage({ title: doc.name, body: doc.body, style: doc.style, kind: doc.kind })), doc.name)
  }],
  ['GET', 'documents/:id/chat', async ({ uid, p }) => getChat(uid, p.id)],
  ['POST', 'documents/:id/chat', async ({ uid, p, body }) => ({ messages: await sendChat(uid, p.id, await body()) })],
  // Writes Claude's proposed revision into the document, keeping the old text as a version.
  ['POST', 'documents/:id/chat/:messageId/apply', async ({ uid, p }) => applyProposal(uid, p.id, p.messageId)],
  ['GET', 'revisions/:id/pdf', async ({ uid, p }) => {
    const rev = await revisionBody(uid, p.id)
    const [doc] = await db.select({ kind: joblowskiDocuments.kind }).from(joblowskiDocuments).where(eq(joblowskiDocuments.id, rev.documentId))
    return pdfResponse(await htmlToPdf(renderPage({ title: rev.name, body: rev.body, style: rev.style as DocStyle, kind: doc.kind as DocKind })), rev.name)
  }],
  // The text of an old version, for the editor to load.
  ['GET', 'revisions/:id/restore', async ({ uid, p }) => {
    const rev = await revisionBody(uid, p.id)
    return { body: rev.body, style: rev.style }
  }],

  // Facts: what you have told Joblowski about yourself; every draft may draw on it.
  ['GET', 'facts', async ({ uid }) => ({ facts: await listFacts(uid) })],
  ['POST', 'facts', async ({ uid, body }) => addFact(uid, await body())],
  ['PATCH', 'facts/:id', async ({ uid, p, body }) => updateFact(uid, p.id, await body())],
  ['DELETE', 'facts/:id', async ({ uid, p }) => deleteFact(uid, p.id)],

  // Map and walks
  ['GET', 'map/home', async ({ uid }) => ({ home: await getHome(uid) })],
  ['PUT', 'map/home', async ({ uid, body }) => ({ home: await setHome(uid, await body()) })],
  // A walking route from home through the chosen jobs; { optimize: false } keeps their order.
  ['POST', 'map/plan', async ({ uid, body }) => planWalk(uid, await body())],
  ['GET', 'map/walks', async ({ uid }) => ({ walks: await listWalks(uid) })],
  ['POST', 'map/walks', async ({ uid, body }) => saveWalk(uid, await body())],
  ['PATCH', 'map/walks/:id', async ({ uid, p, body }) => updateWalk(uid, p.id, await body())],
  ['DELETE', 'map/walks/:id', async ({ uid, p }) => deleteWalk(uid, p.id)],

  // Currency rates for showing pay
  ['GET', 'rates', async () => getRates()],
  ['PUT', 'rates', async ({ body }) => setRates(await body())],
]

/** Matches 'applications/:id/log' against ['applications', 'abc', 'log']. */
function match(pattern: string, parts: string[]): Record<string, string> | null {
  const want = pattern.split('/')
  if (want.length !== parts.length) return null
  const p: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) p[want[i].slice(1)] = parts[i]
    else if (want[i] !== parts[i]) return null
  }
  return p
}

type RouteParams = { params: Promise<{ path?: string[] }> }

function handler(method: Method) {
  return async (req: NextRequest, { params }: RouteParams): Promise<Response> => {
    const parts = ((await params).path ?? []).map(decodeURIComponent)
    let found: { run: Handler; p: Record<string, string> } | null = null
    let pathKnown = false
    for (const [m, pattern, run] of routes) {
      const p = match(pattern, parts)
      if (!p) continue
      pathKnown = true
      if (m === method) {
        found = { run, p }
        break
      }
    }
    if (!found) return NextResponse.json({ error: pathKnown ? 'Method not allowed' : 'Not found' }, { status: pathKnown ? 405 : 404 })

    const uid = await joblowskiHost().userId()
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const body = async () => {
        const json = await req.json().catch(() => ({}))
        return json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
      }
      const result = await found.run({ uid, req, p: found.p, body })
      return result instanceof Response ? result : NextResponse.json(result)
    } catch (err) {
      if (err instanceof JoblowskiError) return NextResponse.json({ error: err.message }, { status: err.status })
      console.error('[joblowski]', err)
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
    }
  }
}

export const GET = handler('GET')
export const POST = handler('POST')
export const PUT = handler('PUT')
export const PATCH = handler('PATCH')
export const DELETE = handler('DELETE')
