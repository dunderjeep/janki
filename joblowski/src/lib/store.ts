/** Applications, résumés, cover letters and custom board links. */
import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, isNull, or, sql, type SQL, ne, lte, isNotNull } from 'drizzle-orm'
import { db } from '../host'
import { joblowskiApplications, joblowskiBoards, joblowskiBoardsSeeded, joblowskiDocuments, joblowskiFacts, joblowskiRevisions, joblowskiStatusEvents } from '../schema'
import { BOARD_GROUPS } from './boards'
import { draftDocument, readPosting } from './draft'
import { geocode } from './geo'
import { BLANK_LETTER, BLANK_RESUME } from './render'
import {
  DOC_STYLES,
  isHttpUrl,
  PLACEHOLDER,
  STATUSES,
  UNSENT_STATUSES,
  type Application,
  type CustomBoard,
  type Doc,
  type DocKind,
  type DocStyle,
  type DocSummary,
  type DraftNotes,
  type PinnedDoc,
  type Status,
} from './types'

export { JoblowskiError } from './errors'
import { JoblowskiError } from './errors'

const NOT_FOUND = () => new JoblowskiError('Not found', 404)
const AUTO_VERSION_MINUTES = 15
const MAX_POSTING = 60_000

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })

function text(value: unknown, label: string, max: number): string {
  const result = String(value ?? '').trim()
  if (!result) throw new JoblowskiError(`${label} is required`)
  if (result.length > max) throw new JoblowskiError(`${label} is too long`)
  return result
}

function optionalText(value: unknown, max: number): string | null {
  const result = String(value ?? '').trim()
  return result ? result.slice(0, max) : null
}

function optionalUrl(value: unknown): string | null {
  const result = String(value ?? '').trim()
  if (!result) return null
  if (!isHttpUrl(result)) throw new JoblowskiError('The job link must start with http:// or https://')
  return result
}

function optionalDate(value: unknown, label: string): string | null {
  const result = String(value ?? '').trim()
  if (!result) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result))) throw new JoblowskiError(`${label} is not a valid date`)
  return result
}

function statusOf(value: unknown): Status {
  if (!STATUSES.includes(value as Status)) throw new JoblowskiError('Unknown status')
  return value as Status
}

function styleOf(value: unknown): DocStyle {
  if (!DOC_STYLES.includes(value as DocStyle)) throw new JoblowskiError('Unknown style')
  return value as DocStyle
}

const hashOf = (style: string, body: string) => createHash('sha256').update(`${style}\0${body}`).digest('hex')

// ── Documents ────────────────────────────────────────────────────────────────

export type DocRow = typeof joblowskiDocuments.$inferSelect

export async function ownedDoc(uid: string, id: string): Promise<DocRow> {
  const [doc] = await db.select().from(joblowskiDocuments).where(and(eq(joblowskiDocuments.id, id), eq(joblowskiDocuments.ownerUid, uid)))
  if (!doc) throw NOT_FOUND()
  return doc
}

export async function addRevision(doc: DocRow, label: string | null) {
  const sha256 = hashOf(doc.style, doc.body)
  const [row] = await db
    .insert(joblowskiRevisions)
    .values({ documentId: doc.id, ownerUid: doc.ownerUid, name: doc.name, body: doc.body, style: doc.style, sha256, label })
    .returning()
  return row
}

/** A frozen copy of the document as it stands, reusing one if nothing changed. */
async function pinCurrent(doc: DocRow): Promise<string> {
  const [latest] = await db
    .select({ id: joblowskiRevisions.id })
    .from(joblowskiRevisions)
    .where(and(eq(joblowskiRevisions.documentId, doc.id), eq(joblowskiRevisions.sha256, hashOf(doc.style, doc.body))))
    .orderBy(desc(joblowskiRevisions.createdAt))
    .limit(1)
  return latest?.id ?? (await addRevision(doc, null)).id
}

const pinnedRefs = (revisionIds: SQL) =>
  or(inArray(joblowskiApplications.resumeRevisionId, revisionIds), inArray(joblowskiApplications.letterRevisionId, revisionIds))

export async function listDocuments(uid: string): Promise<DocSummary[]> {
  const rows = await db
    .select({
      id: joblowskiDocuments.id,
      kind: joblowskiDocuments.kind,
      name: joblowskiDocuments.name,
      style: joblowskiDocuments.style,
      updatedAt: joblowskiDocuments.updatedAt,
      versions: sql<number>`(SELECT count(*)::int FROM joblowski.revisions r WHERE r.document_id = joblowski.documents.id)`,
      usedIn: sql<number>`(SELECT count(*)::int FROM joblowski.applications a
        JOIN joblowski.revisions r ON r.id IN (a.resume_revision_id, a.letter_revision_id)
        WHERE r.document_id = joblowski.documents.id)`,
    })
    .from(joblowskiDocuments)
    .where(and(eq(joblowskiDocuments.ownerUid, uid), isNull(joblowskiDocuments.archivedAt)))
    .orderBy(desc(joblowskiDocuments.updatedAt))
  return rows.map((r) => ({ ...r, kind: r.kind as DocKind, style: r.style as DocStyle, updatedAt: r.updatedAt.toISOString() }))
}

export async function getDocument(uid: string, id: string): Promise<Doc> {
  const doc = await ownedDoc(uid, id)
  const revisions = await db
    .select({ id: joblowskiRevisions.id, label: joblowskiRevisions.label, createdAt: joblowskiRevisions.createdAt })
    .from(joblowskiRevisions)
    .where(eq(joblowskiRevisions.documentId, id))
    .orderBy(desc(joblowskiRevisions.createdAt))
  return {
    id: doc.id,
    kind: doc.kind as DocKind,
    name: doc.name,
    style: doc.style as DocStyle,
    updatedAt: doc.updatedAt.toISOString(),
    versions: revisions.length,
    usedIn: 0,
    body: doc.body,
    aiNotes: (doc.aiNotes ?? null) as DraftNotes | null,
    derivedFrom: doc.derivedFrom,
    revisions: revisions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }
}

export async function revisionBody(uid: string, revisionId: string) {
  const [row] = await db.select().from(joblowskiRevisions).where(and(eq(joblowskiRevisions.id, revisionId), eq(joblowskiRevisions.ownerUid, uid)))
  if (!row) throw NOT_FOUND()
  return row
}

export async function createDocument(uid: string, input: { kind?: unknown; name?: unknown; fromId?: unknown }) {
  if (input.fromId) {
    const source = await ownedDoc(uid, String(input.fromId))
    const [copy] = await db
      .insert(joblowskiDocuments)
      .values({ ownerUid: uid, kind: source.kind, name: `${source.name} (copy)`.slice(0, 200), body: source.body, style: source.style, derivedFrom: source.id })
      .returning()
    return { id: copy.id }
  }
  if (input.kind !== 'resume' && input.kind !== 'letter') throw new JoblowskiError('Unknown document kind')
  const [doc] = await db
    .insert(joblowskiDocuments)
    .values({ ownerUid: uid, kind: input.kind, name: text(input.name, 'A name', 200), body: input.kind === 'resume' ? BLANK_RESUME : BLANK_LETTER })
    .returning()
  return { id: doc.id }
}

export async function saveDocument(uid: string, id: string, input: { name?: unknown; body?: unknown; style?: unknown }) {
  const doc = await ownedDoc(uid, id)
  const name = input.name === undefined ? doc.name : text(input.name, 'A name', 200)
  const body = input.body === undefined ? doc.body : String(input.body)
  const style = input.style === undefined ? doc.style : styleOf(input.style)
  if (body.length > 200_000) throw new JoblowskiError('That document is too long')
  if (name === doc.name && body === doc.body && style === doc.style) return { updatedAt: doc.updatedAt.toISOString() }

  const [saved] = await db
    .update(joblowskiDocuments)
    .set({ name, body, style, updatedAt: new Date() })
    .where(eq(joblowskiDocuments.id, id))
    .returning()

  // History builds itself while typing, without one entry per keystroke.
  if (body !== doc.body) {
    const [last] = await db
      .select({ createdAt: joblowskiRevisions.createdAt })
      .from(joblowskiRevisions)
      .where(eq(joblowskiRevisions.documentId, id))
      .orderBy(desc(joblowskiRevisions.createdAt))
      .limit(1)
    if (!last || Date.now() - last.createdAt.getTime() > AUTO_VERSION_MINUTES * 60_000) await addRevision(doc, 'Autosaved')
  }
  return { updatedAt: saved.updatedAt.toISOString() }
}

export async function saveVersion(uid: string, id: string, label: unknown) {
  const row = await addRevision(await ownedDoc(uid, id), optionalText(label, 120))
  return { id: row.id, label: row.label, createdAt: row.createdAt.toISOString() }
}

/** A document some application was sent with is hidden, so the record survives. */
export async function deleteDocument(uid: string, id: string) {
  await ownedDoc(uid, id)
  const revisionIds = sql`(SELECT r.id FROM joblowski.revisions r WHERE r.document_id = ${id})`
  const [used] = await db.select({ id: joblowskiApplications.id }).from(joblowskiApplications).where(pinnedRefs(revisionIds)).limit(1)
  if (used) {
    await db.update(joblowskiDocuments).set({ archivedAt: new Date() }).where(eq(joblowskiDocuments.id, id))
    return { archived: true }
  }
  await db.delete(joblowskiDocuments).where(eq(joblowskiDocuments.id, id))
  return { archived: false }
}

// ── Applications ─────────────────────────────────────────────────────────────

export async function listApplications(uid: string): Promise<Application[]> {
  await wakeParked(uid)
  const apps = await db.select().from(joblowskiApplications).where(eq(joblowskiApplications.ownerUid, uid)).orderBy(desc(joblowskiApplications.createdAt))
  const [events, pins] = await Promise.all([
    db.select().from(joblowskiStatusEvents).where(eq(joblowskiStatusEvents.ownerUid, uid)).orderBy(joblowskiStatusEvents.at),
    db
      .select({
        revisionId: joblowskiRevisions.id,
        documentId: joblowskiRevisions.documentId,
        name: joblowskiDocuments.name,
        pinnedAt: joblowskiRevisions.createdAt,
        sha256: joblowskiRevisions.sha256,
        body: joblowskiDocuments.body,
        style: joblowskiDocuments.style,
      })
      .from(joblowskiRevisions)
      .innerJoin(joblowskiDocuments, eq(joblowskiDocuments.id, joblowskiRevisions.documentId))
      .where(eq(joblowskiRevisions.ownerUid, uid)),
  ])
  const byId = new Map(pins.map((p) => [p.revisionId, p]))
  const pinned = (id: string | null): PinnedDoc | null => {
    const p = id ? byId.get(id) : undefined
    if (!p) return null
    return {
      revisionId: p.revisionId,
      documentId: p.documentId,
      name: p.name,
      pinnedAt: p.pinnedAt.toISOString(),
      changedSince: hashOf(p.style, p.body) !== p.sha256,
    }
  }
  return apps.map((a) => ({
    id: a.id,
    company: a.company,
    role: a.role,
    url: a.url,
    location: a.location,
    category: a.category,
    address: a.address,
    lat: a.lat,
    lon: a.lon,
    status: a.status as Status,
    parkedUntil: a.parkedUntil,
    dateApplied: a.dateApplied,
    dueDate: a.dueDate,
    notes: a.notes,
    posting: a.posting,
    source: a.source,
    resume: pinned(a.resumeRevisionId),
    letter: pinned(a.letterRevisionId),
    history: events.filter((e) => e.applicationId === a.id).map((e) => ({ id: e.id, status: e.status as Status | null, note: e.note, at: e.at.toISOString() })),
    createdAt: a.createdAt.toISOString(),
  }))
}

export async function createApplication(uid: string, input: Record<string, unknown>) {
  const url = optionalUrl(input.url)
  if (url) {
    const [existing] = await db.select({ id: joblowskiApplications.id }).from(joblowskiApplications).where(and(eq(joblowskiApplications.ownerUid, uid), eq(joblowskiApplications.url, url)))
    if (existing) return { id: existing.id, existed: true }
  }
  const status = input.status === undefined ? 'saved' : statusOf(input.status)
  const where = await locate(input.address)
  const [app] = await db
    .insert(joblowskiApplications)
    .values({
      ownerUid: uid,
      company: text(input.company, 'Company', 200),
      role: text(input.role, 'Role', 300),
      url,
      location: optionalText(input.location, 200),
      category: optionalText(input.category, 60),
      ...where.columns,
      status,
      parkedUntil: status === 'parked' ? optionalDate(input.parkedUntil, 'Parked until') : null,
      dateApplied: optionalDate(input.dateApplied, 'Date applied') ?? (UNSENT_STATUSES.includes(status) ? null : today()),
      dueDate: optionalDate(input.dueDate, 'Due date'),
      notes: String(input.notes ?? '').slice(0, 20_000),
      source: optionalText(input.source, 40),
    })
    .returning()
  await db.insert(joblowskiStatusEvents).values({ applicationId: app.id, ownerUid: uid, status })
  return { id: app.id, existed: false, located: where.located }
}

/**
 * Columns for an address, with its place on the map when OpenStreetMap knows
 * it. An address it cannot find is still kept, just not plotted.
 */
async function locate(value: unknown): Promise<{ columns: { address: string | null; lat: number | null; lon: number | null } | Record<string, never>; located: boolean }> {
  const address = optionalText(value, 300)
  if (!address) return { columns: { address: null, lat: null, lon: null }, located: false }
  const place = await geocode(address).catch(() => null)
  return { columns: { address, lat: place?.lat ?? null, lon: place?.lon ?? null }, located: Boolean(place) }
}

async function ownedApplication(uid: string, id: string) {
  const [app] = await db.select().from(joblowskiApplications).where(and(eq(joblowskiApplications.id, id), eq(joblowskiApplications.ownerUid, uid)))
  if (!app) throw NOT_FOUND()
  return app
}

async function repin(uid: string, revisionId: string | null): Promise<string | null> {
  if (!revisionId) return null
  const revision = await revisionBody(uid, revisionId)
  return pinCurrent(await ownedDoc(uid, revision.documentId))
}

export async function updateApplication(uid: string, id: string, input: Record<string, unknown>) {
  const app = await ownedApplication(uid, id)
  const status = input.status === undefined ? (app.status as Status) : statusOf(input.status)
  // Applying is the moment the words are final. A parked job that had already been sent keeps its record.
  const justApplied = !UNSENT_STATUSES.includes(status) && (app.status === 'saved' || (app.status === 'parked' && app.dateApplied === null))
  const has = (key: string) => input[key] !== undefined

  let resumeRevisionId = app.resumeRevisionId
  let letterRevisionId = app.letterRevisionId
  const pickDocument = async (value: unknown, kind: DocKind) => {
    if (!value) return null
    const doc = await ownedDoc(uid, String(value))
    if (doc.kind !== kind) throw new JoblowskiError('That is the wrong kind of document')
    return pinCurrent(doc)
  }
  if (has('resumeDocumentId')) resumeRevisionId = await pickDocument(input.resumeDocumentId, 'resume')
  if (has('letterDocumentId')) letterRevisionId = await pickDocument(input.letterDocumentId, 'letter')
  // What was attached while drafting may have been edited since; applying is
  // the moment the words are final.
  if (justApplied) {
    if (!has('resumeDocumentId')) resumeRevisionId = await repin(uid, resumeRevisionId)
    if (!has('letterDocumentId')) letterRevisionId = await repin(uid, letterRevisionId)
  }

  const url = has('url') ? optionalUrl(input.url) : app.url
  // Looked up only when the address changes, so an edit to the notes never waits on the map.
  const where = has('address') && String(input.address ?? '').trim() !== (app.address ?? '')
    ? await locate(input.address)
    : { columns: {}, located: app.lat !== null }
  let dateApplied = has('dateApplied') ? optionalDate(input.dateApplied, 'Date applied') : app.dateApplied
  if (justApplied && !dateApplied) dateApplied = today()

  await db
    .update(joblowskiApplications)
    .set({
      company: has('company') ? text(input.company, 'Company', 200) : app.company,
      role: has('role') ? text(input.role, 'Role', 300) : app.role,
      url,
      location: has('location') ? optionalText(input.location, 200) : app.location,
      category: has('category') ? optionalText(input.category, 60) : app.category,
      ...where.columns,
      status,
      parkedUntil: status !== 'parked' ? null : has('parkedUntil') ? optionalDate(input.parkedUntil, 'Parked until') : app.parkedUntil,
      dateApplied,
      dueDate: has('dueDate') ? optionalDate(input.dueDate, 'Due date') : app.dueDate,
      notes: has('notes') ? String(input.notes ?? '').slice(0, 20_000) : app.notes,
      posting: has('posting') ? String(input.posting ?? '').slice(0, MAX_POSTING) : app.posting,
      resumeRevisionId,
      letterRevisionId,
      updatedAt: new Date(),
    })
    .where(eq(joblowskiApplications.id, id))
    .catch((err) => {
      if (String(err?.cause?.code ?? err?.code) === '23505') throw new JoblowskiError('Another tracked job already has that link', 409)
      throw err
    })
  if (status !== app.status) await db.insert(joblowskiStatusEvents).values({ applicationId: id, ownerUid: uid, status })
  return { ok: true, located: where.located }
}

/** Back to the status the job had before it was parked; one parked straight from a search returns as saved. */
export async function unparkApplication(uid: string, id: string) {
  const app = await ownedApplication(uid, id)
  if (app.status !== 'parked') throw new JoblowskiError('That job is not parked')
  const [before] = await db
    .select({ status: joblowskiStatusEvents.status })
    .from(joblowskiStatusEvents)
    .where(and(eq(joblowskiStatusEvents.applicationId, id), isNotNull(joblowskiStatusEvents.status), ne(joblowskiStatusEvents.status, 'parked')))
    .orderBy(desc(joblowskiStatusEvents.at))
    .limit(1)
  const status = (before?.status ?? 'saved') as Status
  await db.update(joblowskiApplications).set({ status, parkedUntil: null, updatedAt: new Date() }).where(eq(joblowskiApplications.id, id))
  await db.insert(joblowskiStatusEvents).values({ applicationId: id, ownerUid: uid, status })
  return { ok: true }
}

/** Snoozed jobs whose day has come go back to what they were. Runs before anything lists or acts on jobs. */
export async function wakeParked(uid: string): Promise<void> {
  const due = await db
    .select({ id: joblowskiApplications.id })
    .from(joblowskiApplications)
    .where(and(eq(joblowskiApplications.ownerUid, uid), eq(joblowskiApplications.status, 'parked'), lte(joblowskiApplications.parkedUntil, sql`CURRENT_DATE`)))
  for (const { id } of due) await unparkApplication(uid, id)
}

/** A line in the job's history that is not a status change: "took the test", "second interview". */
export async function logNote(uid: string, id: string, input: { note?: unknown; at?: unknown }) {
  await ownedApplication(uid, id)
  const note = String(input.note ?? '').trim().slice(0, 2000)
  if (!note) throw new JoblowskiError('Write what happened')
  const day = optionalDate(input.at, 'Date')
  const at = day ? new Date(`${day}T12:00:00`) : new Date()
  const [row] = await db.insert(joblowskiStatusEvents).values({ applicationId: id, ownerUid: uid, status: null, note, at }).returning({ id: joblowskiStatusEvents.id })
  await db.update(joblowskiApplications).set({ updatedAt: new Date() }).where(eq(joblowskiApplications.id, id))
  return { id: row.id }
}

/** Only a note can go; the status changes are the record. */
export async function deleteNote(uid: string, id: string, eventId: string) {
  await db
    .delete(joblowskiStatusEvents)
    .where(and(eq(joblowskiStatusEvents.id, eventId), eq(joblowskiStatusEvents.applicationId, id), eq(joblowskiStatusEvents.ownerUid, uid), isNull(joblowskiStatusEvents.status)))
  return { ok: true }
}

export async function deleteApplication(uid: string, id: string) {
  await db.delete(joblowskiApplications).where(and(eq(joblowskiApplications.id, id), eq(joblowskiApplications.ownerUid, uid)))
  return { ok: true }
}

export const longDate = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' })

/** A new document made for one job and attached to it. */
async function attachCopy(app: typeof joblowskiApplications.$inferSelect, source: DocRow, body: string, aiNotes: DraftNotes | null) {
  const [copy] = await db
    .insert(joblowskiDocuments)
    .values({
      ownerUid: app.ownerUid,
      kind: source.kind,
      name: `${app.company} – ${app.role}`.slice(0, 200),
      body,
      style: source.style,
      derivedFrom: source.id,
      aiNotes,
    })
    .returning()
  const revisionId = await pinCurrent(copy)
  await db
    .update(joblowskiApplications)
    .set(source.kind === 'resume' ? { resumeRevisionId: revisionId } : { letterRevisionId: revisionId })
    .where(eq(joblowskiApplications.id, app.id))
  return { id: copy.id }
}

/** Claude's draft for this job, from the pasted ad or else the job's link. */
export async function draftForApplication(uid: string, applicationId: string, input: { documentId?: unknown; kind?: unknown; guidance?: unknown }) {
  const app = await ownedApplication(uid, applicationId)
  // A letter can be drafted with no letter of your own yet: it starts from the
  // standard layout, which is kept as a letter you can reuse and edit.
  const documentId = input.documentId
    ? String(input.documentId)
    : input.kind === 'letter'
      ? (await createDocument(uid, { kind: 'letter', name: 'My cover letter' })).id
      : ''
  const source = await ownedDoc(uid, documentId)

  let resume: string | null = null
  if (source.kind === 'letter') {
    if (!app.resumeRevisionId) throw new JoblowskiError('Attach a résumé to this job first, so the letter has facts to draw on')
    resume = (await revisionBody(uid, app.resumeRevisionId)).body
  }

  let posting = app.posting.trim()
  if (!posting) {
    if (!app.url) throw new JoblowskiError('Paste the job text, or add a link to the job')
    posting = (await readPosting(app.url)).slice(0, MAX_POSTING)
    await db.update(joblowskiApplications).set({ posting }).where(eq(joblowskiApplications.id, app.id))
  }

  const { body, notes } = await draftDocument({
    kind: source.kind as DocKind,
    source: source.body,
    resume,
    facts: (await db.select({ text: joblowskiFacts.text }).from(joblowskiFacts).where(eq(joblowskiFacts.ownerUid, uid)).orderBy(joblowskiFacts.createdAt)).map((f) => f.text),
    posting,
    guidance: String(input.guidance ?? '').slice(0, 2000),
    company: app.company,
    role: app.role,
    date: longDate(),
  })
  return attachCopy(app, source, body, notes)
}

/** A copy of a résumé or letter for one job, with its blanks filled in. */
export async function tailorDocument(uid: string, applicationId: string, input: { documentId?: unknown }) {
  const app = await ownedApplication(uid, applicationId)
  const source = await ownedDoc(uid, String(input.documentId ?? ''))
  const date = longDate()
  const values: Record<string, string> = { company: app.company, role: app.role, date }
  return attachCopy(app, source, source.body.replace(PLACEHOLDER, (_, key: string) => values[key.toLowerCase()]), null)
}

// ── Board links ──────────────────────────────────────────────────────────────
// Every board is the person's own row. The standard set (lib/boards.ts) is
// copied in the first time, and again only on request (restoreBoards).

const boardColumns = {
  id: joblowskiBoards.id,
  name: joblowskiBoards.name,
  urlTemplate: joblowskiBoards.urlTemplate,
  section: joblowskiBoards.section,
  note: joblowskiBoards.note,
  quick: joblowskiBoards.quick,
  position: joblowskiBoards.position,
}

const DEFAULT_ROWS = BOARD_GROUPS.flatMap((g) => g.boards.map((b) => ({ ...b, section: g.title }))).map((b, i) => ({
  name: b.name, urlTemplate: b.urlTemplate, note: b.note, section: b.section, quick: b.quick ?? false, position: i,
}))

export async function listBoards(uid: string): Promise<CustomBoard[]> {
  const [seeded] = await db.insert(joblowskiBoardsSeeded).values({ ownerUid: uid }).onConflictDoNothing().returning()
  if (seeded) await db.insert(joblowskiBoards).values(DEFAULT_ROWS.map((b) => ({ ...b, ownerUid: uid })))
  return db
    .select(boardColumns)
    .from(joblowskiBoards)
    .where(eq(joblowskiBoards.ownerUid, uid))
    .orderBy(joblowskiBoards.position, joblowskiBoards.createdAt)
}

type BoardInput = { name?: unknown; urlTemplate?: unknown; section?: unknown; note?: unknown; quick?: unknown }

function boardLink(value: unknown): string {
  const urlTemplate = text(value, 'A link', 1000)
  if (!isHttpUrl(urlTemplate.replace(/\{[ql]\}/g, 'x'))) throw new JoblowskiError('The link must start with http:// or https://')
  return urlTemplate
}

const boardSection = (value: unknown) => String(value ?? '').trim().slice(0, 100) || 'Your links'
const boardNote = (value: unknown) => String(value ?? '').trim().slice(0, 200)

export async function createBoard(uid: string, input: BoardInput) {
  const section = boardSection(input.section)
  // A new board goes last in its section, or last of all in a new section.
  const [{ last }] = await db
    .select({ last: sql<number | null>`max(${joblowskiBoards.position})` })
    .from(joblowskiBoards)
    .where(and(eq(joblowskiBoards.ownerUid, uid), eq(joblowskiBoards.section, section)))
  const [{ end }] = await db
    .select({ end: sql<number | null>`max(${joblowskiBoards.position})` })
    .from(joblowskiBoards)
    .where(eq(joblowskiBoards.ownerUid, uid))
  const position = last !== null ? Number(last) + 1 : Number(end ?? -1) + 1
  if (last !== null) {
    await db.update(joblowskiBoards).set({ position: sql`${joblowskiBoards.position} + 1` })
      .where(and(eq(joblowskiBoards.ownerUid, uid), sql`${joblowskiBoards.position} >= ${position}`))
  }
  const [row] = await db.insert(joblowskiBoards).values({
    ownerUid: uid,
    name: text(input.name, 'A name', 100),
    urlTemplate: boardLink(input.urlTemplate),
    section,
    note: boardNote(input.note),
    quick: input.quick === true,
    position,
  }).returning(boardColumns)
  return row
}

export async function updateBoard(uid: string, id: string, input: BoardInput) {
  const set: Partial<typeof joblowskiBoards.$inferInsert> = {}
  if (input.name !== undefined) set.name = text(input.name, 'A name', 100)
  if (input.urlTemplate !== undefined) set.urlTemplate = boardLink(input.urlTemplate)
  if (input.section !== undefined) set.section = boardSection(input.section)
  if (input.note !== undefined) set.note = boardNote(input.note)
  if (input.quick !== undefined) set.quick = input.quick === true
  if (Object.keys(set).length === 0) throw new JoblowskiError('Nothing to change')
  const [row] = await db.update(joblowskiBoards).set(set)
    .where(and(eq(joblowskiBoards.id, id), eq(joblowskiBoards.ownerUid, uid)))
    .returning(boardColumns)
  if (!row) throw NOT_FOUND()
  return row
}

/** Saves the order of the person's boards: ids first to last. */
export async function reorderBoards(uid: string, input: { ids?: unknown }) {
  if (!Array.isArray(input.ids)) throw new JoblowskiError('ids must be a list')
  const ids = input.ids.map(String)
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.update(joblowskiBoards).set({ position: i }).where(and(eq(joblowskiBoards.id, id), eq(joblowskiBoards.ownerUid, uid)))
    }
  })
  return { boards: await listBoards(uid) }
}

/** Adds back any standard board no longer in the list (matched by name). */
export async function restoreBoards(uid: string) {
  const have = new Set((await listBoards(uid)).map((b) => b.name.toLowerCase()))
  const missing = DEFAULT_ROWS.filter((b) => !have.has(b.name.toLowerCase()))
  for (const b of missing) await createBoard(uid, b)
  return { boards: await listBoards(uid), added: missing.length }
}

export async function deleteBoard(uid: string, id: string) {
  await db.delete(joblowskiBoards).where(and(eq(joblowskiBoards.id, id), eq(joblowskiBoards.ownerUid, uid)))
  return { ok: true }
}
