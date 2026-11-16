/**
 * Talking a draft through with Claude, and the facts about yourself that
 * come out of it.
 *
 * A proposal is never written into the document by Claude: it waits on the
 * message until you apply it, and applying keeps what was there as a version.
 */
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '../host'
import { joblowskiApplications, joblowskiDocMessages, joblowskiDocuments, joblowskiFacts, joblowskiRevisions } from '../schema'
import { reviseDocument } from './draft'
import { addRevision, getDocument, JoblowskiError, longDate, ownedDoc, revisionBody } from './store'
import type { DocKind, DraftNotes } from './types'

const MAX_MESSAGE = 4000
const MAX_FACT = 500

export type Fact = { id: string; text: string; createdAt: string }

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal: { body: string; notes: DraftNotes } | null
  factsToRemember: string[]
  appliedAt: string | null
  createdAt: string
}

export type ChatContext = { company: string | null; role: string | null; hasPosting: boolean }

// ── Facts ────────────────────────────────────────────────────────────────────

export async function listFacts(uid: string): Promise<Fact[]> {
  const rows = await db.select().from(joblowskiFacts).where(eq(joblowskiFacts.ownerUid, uid)).orderBy(asc(joblowskiFacts.createdAt))
  return rows.map((f) => ({ id: f.id, text: f.text, createdAt: f.createdAt.toISOString() }))
}

const factText = (v: unknown) => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  if (!t) throw new JoblowskiError('Write the fact out')
  if (t.length > MAX_FACT) throw new JoblowskiError(`Keep a fact under ${MAX_FACT} characters`)
  return t
}

export async function addFact(uid: string, input: { text?: unknown; documentId?: unknown }): Promise<Fact> {
  const [row] = await db
    .insert(joblowskiFacts)
    .values({ ownerUid: uid, text: factText(input.text), sourceDocumentId: typeof input.documentId === 'string' ? input.documentId : null })
    .returning()
  return { id: row.id, text: row.text, createdAt: row.createdAt.toISOString() }
}

export async function updateFact(uid: string, id: string, input: { text?: unknown }): Promise<Fact> {
  const [row] = await db
    .update(joblowskiFacts)
    .set({ text: factText(input.text), updatedAt: new Date() })
    .where(and(eq(joblowskiFacts.id, id), eq(joblowskiFacts.ownerUid, uid)))
    .returning()
  if (!row) throw new JoblowskiError('Not found', 404)
  return { id: row.id, text: row.text, createdAt: row.createdAt.toISOString() }
}

export async function deleteFact(uid: string, id: string) {
  const rows = await db.delete(joblowskiFacts).where(and(eq(joblowskiFacts.id, id), eq(joblowskiFacts.ownerUid, uid))).returning({ id: joblowskiFacts.id })
  if (rows.length === 0) throw new JoblowskiError('Not found', 404)
  return { ok: true }
}

export const factTexts = async (uid: string) => (await listFacts(uid)).map((f) => f.text)

// ── The conversation ─────────────────────────────────────────────────────────

/** The job a document was attached to, if any: where the posting comes from. */
async function applicationFor(uid: string, documentId: string) {
  const revisions = db.select({ id: joblowskiRevisions.id }).from(joblowskiRevisions).where(eq(joblowskiRevisions.documentId, documentId))
  const [app] = await db
    .select()
    .from(joblowskiApplications)
    .where(and(
      eq(joblowskiApplications.ownerUid, uid),
      or(inArray(joblowskiApplications.resumeRevisionId, revisions), inArray(joblowskiApplications.letterRevisionId, revisions)),
    ))
    .orderBy(desc(joblowskiApplications.updatedAt))
    .limit(1)
  return app ?? null
}

function toMessage(row: typeof joblowskiDocMessages.$inferSelect): ChatMessage {
  const stored = (row.proposal ?? null) as { proposal?: ChatMessage['proposal']; factsToRemember?: string[] } | null
  return {
    id: row.id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    proposal: stored?.proposal ?? null,
    factsToRemember: stored?.factsToRemember ?? [],
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function messages(uid: string, documentId: string) {
  return db
    .select()
    .from(joblowskiDocMessages)
    .where(and(eq(joblowskiDocMessages.ownerUid, uid), eq(joblowskiDocMessages.documentId, documentId)))
    .orderBy(asc(joblowskiDocMessages.createdAt))
}

export async function getChat(uid: string, documentId: string): Promise<{ messages: ChatMessage[]; context: ChatContext }> {
  await ownedDoc(uid, documentId)
  const app = await applicationFor(uid, documentId)
  return {
    messages: (await messages(uid, documentId)).map(toMessage),
    context: { company: app?.company ?? null, role: app?.role ?? null, hasPosting: Boolean(app?.posting.trim()) },
  }
}

export async function sendChat(uid: string, documentId: string, input: { message?: unknown }): Promise<ChatMessage[]> {
  const text = typeof input.message === 'string' ? input.message.trim() : ''
  if (!text) throw new JoblowskiError('Write a message')
  if (text.length > MAX_MESSAGE) throw new JoblowskiError(`Keep a message under ${MAX_MESSAGE} characters`)

  const doc = await ownedDoc(uid, documentId)
  const original = doc.derivedFrom ? await ownedDoc(uid, doc.derivedFrom).catch(() => null) : null
  const app = await applicationFor(uid, documentId)
  let resume: string | null = null
  if (doc.kind === 'letter' && app?.resumeRevisionId) resume = (await revisionBody(uid, app.resumeRevisionId)).body
  const history = (await messages(uid, documentId)).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const reply = await reviseDocument({
    kind: doc.kind as DocKind,
    original: original?.body ?? doc.body,
    current: doc.body,
    resume,
    facts: await factTexts(uid),
    posting: app?.posting ?? '',
    notes: (doc.aiNotes ?? null) as DraftNotes | null,
    history,
    message: text,
    company: app?.company ?? '',
    role: app?.role ?? '',
    date: longDate(),
  })

  // Stored only once Claude has answered, so a failed call leaves no orphan question.
  await db.insert(joblowskiDocMessages).values({ ownerUid: uid, documentId, role: 'user', content: text })
  await db.insert(joblowskiDocMessages).values({
    ownerUid: uid,
    documentId,
    role: 'assistant',
    content: reply.reply,
    proposal: { proposal: reply.proposal, factsToRemember: reply.factsToRemember },
    createdAt: new Date(Date.now() + 1),
  })
  return (await messages(uid, documentId)).map(toMessage)
}

/** Writes a proposal into the document, keeping what was there as a version. */
export async function applyProposal(uid: string, documentId: string, messageId: string) {
  const doc = await ownedDoc(uid, documentId)
  const [row] = await db
    .select()
    .from(joblowskiDocMessages)
    .where(and(eq(joblowskiDocMessages.id, messageId), eq(joblowskiDocMessages.ownerUid, uid), eq(joblowskiDocMessages.documentId, documentId)))
  const proposal = row ? toMessage(row).proposal : null
  if (!proposal) throw new JoblowskiError('That message has no revision to apply', 404)

  await addRevision(doc, 'Before Claude’s revision')
  const [updated] = await db
    .update(joblowskiDocuments)
    .set({ body: proposal.body, aiNotes: proposal.notes, updatedAt: new Date() })
    .where(eq(joblowskiDocuments.id, documentId))
    .returning()
  await addRevision(updated, 'Claude’s revision')
  await db.update(joblowskiDocMessages).set({ appliedAt: new Date() }).where(eq(joblowskiDocMessages.id, messageId))
  return getDocument(uid, documentId)
}
