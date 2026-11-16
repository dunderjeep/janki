import { createHash } from 'node:crypto'
import { and, asc, desc, eq, ilike, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { graphNodes } from '@/db/schema/janki'
import {
  porcupinBoards as boards,
  porcupinPinBoards as pinBoards,
  porcupinPinLinks as pinLinks,
  porcupinPins as pins,
  type PorcupinPin,
} from '@/db/schema/porcupin'
import { findNodes } from 'notes/server'
import { didForUser } from '@/lib/notesHost'
import { deleteImages, makeThumb, MAX_IMAGE_BYTES, putImage, sniffImageType } from './images'
import type { BoardView, GraphName, LinkedPin, PinLink, PinView } from './types'

/** A refusal whose message is meant for the person, with its HTTP status. */
export class PorcupinError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const notFound = () => new PorcupinError('Not found', 404)

async function toViews(rows: PorcupinPin[]): Promise<PinView[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [memberships, links] = await Promise.all([
    db.select().from(pinBoards).where(inArray(pinBoards.pinId, ids)),
    db.select().from(pinLinks).where(inArray(pinLinks.pinId, ids)).orderBy(asc(pinLinks.createdAt)),
  ])

  const boardsOf = new Map<string, string[]>()
  for (const m of memberships) boardsOf.set(m.pinId, [...(boardsOf.get(m.pinId) ?? []), m.boardId])
  const linksOf = new Map<string, PinLink[]>()
  for (const l of links) {
    linksOf.set(l.pinId, [...(linksOf.get(l.pinId) ?? []), { graph: l.graph, nodeId: l.nodeId, label: l.nodeLabel }])
  }

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    sizeBytes: r.sizeBytes,
    width: r.width,
    height: r.height,
    title: r.title,
    description: r.description,
    sourceUrl: r.sourceUrl,
    createdAt: r.createdAt.toISOString(),
    boardIds: boardsOf.get(r.id) ?? [],
    links: linksOf.get(r.id) ?? [],
  }))
}

async function getRow(uid: string, id: string): Promise<PorcupinPin> {
  const [row] = await db.select().from(pins).where(and(eq(pins.id, id), eq(pins.ownerUid, uid)))
  if (!row) throw notFound()
  return row
}

async function getView(uid: string, id: string): Promise<PinView> {
  return (await toViews([await getRow(uid, id)]))[0]
}

async function assertBoard(uid: string, boardId: string): Promise<void> {
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerUid, uid)))
  if (!board) throw notFound()
}

async function addToBoard(pinId: string, boardId: string): Promise<void> {
  await db.insert(pinBoards).values({ pinId, boardId }).onConflictDoNothing()
}

export async function listPins(uid: string): Promise<PinView[]> {
  const rows = await db.select().from(pins).where(eq(pins.ownerUid, uid)).orderBy(desc(pins.createdAt))
  return toViews(rows)
}

export async function listBoards(uid: string): Promise<BoardView[]> {
  return db
    .select({ id: boards.id, name: boards.name })
    .from(boards)
    .where(eq(boards.ownerUid, uid))
    .orderBy(asc(sql`lower(${boards.name})`))
}

export async function getPinFile(uid: string, id: string) {
  return getRow(uid, id)
}

/** A pin's stored photo and thumbnail come from the same upload. */
export async function createPin(
  uid: string,
  input: {
    filename: string
    bytes: Buffer
    thumb: Buffer | null
    width: number | null
    height: number | null
    boardId: string | null
    sourceUrl: string | null
    title: string | null
  },
): Promise<{ pin: PinView; duplicate: boolean }> {
  if (input.bytes.length > MAX_IMAGE_BYTES) throw new PorcupinError('larger than 40 MB')
  const contentType = sniffImageType(input.bytes)
  if (!contentType) throw new PorcupinError('not a JPEG, PNG, GIF, WebP or AVIF image', 415)
  if (input.boardId) await assertBoard(uid, input.boardId)

  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const finish = async (pinId: string, duplicate: boolean) => {
    if (input.boardId) await addToBoard(pinId, input.boardId)
    return { pin: await getView(uid, pinId), duplicate }
  }

  const [existing] = await db
    .select({ id: pins.id })
    .from(pins)
    .where(and(eq(pins.ownerUid, uid), eq(pins.sha256, sha256)))
  if (existing) return finish(existing.id, true)

  // The server's own thumbnail; the browser's only if sharp cannot read the file.
  const made = await makeThumb(input.bytes)
  const thumb = made?.thumb ?? input.thumb
  const thumbType = thumb && sniffImageType(thumb)
  const storageKey = await putImage(uid, input.bytes, contentType)
  const thumbKey = thumbType ? await putImage(uid, thumb!, thumbType) : null

  const [created] = await db
    .insert(pins)
    .values({
      ownerUid: uid,
      storageKey,
      thumbKey,
      filename: input.filename.slice(0, 255),
      contentType,
      sizeBytes: input.bytes.length,
      sha256,
      width: made?.width ?? input.width,
      height: made?.height ?? input.height,
      sourceUrl: input.sourceUrl,
      title: input.title,
    })
    .onConflictDoNothing()
    .returning({ id: pins.id })
  if (created) return finish(created.id, false)

  // The same file arrived twice at once, and the other upload won.
  await deleteImages([storageKey, thumbKey])
  const [winner] = await db
    .select({ id: pins.id })
    .from(pins)
    .where(and(eq(pins.ownerUid, uid), eq(pins.sha256, sha256)))
  if (!winner) throw new PorcupinError('Upload failed', 500)
  return finish(winner.id, true)
}

function cleanText(value: unknown, max: number, field: string): string | null {
  if (value !== null && typeof value !== 'string') throw new PorcupinError(`${field} must be text`)
  const text = value?.trim() ?? ''
  if (text.length > max) throw new PorcupinError(`${field} is longer than ${max} characters`)
  return text || null
}

export async function updatePin(
  uid: string,
  id: string,
  patch: { title?: unknown; description?: unknown; addBoard?: unknown; removeBoard?: unknown },
): Promise<PinView> {
  await getRow(uid, id)

  const fields: { title?: string | null; description?: string | null } = {}
  if (patch.title !== undefined) fields.title = cleanText(patch.title, 200, 'Title')
  if (patch.description !== undefined) fields.description = cleanText(patch.description, 5000, 'Description')
  if (Object.keys(fields).length > 0) {
    await db.update(pins).set({ ...fields, updatedAt: new Date() }).where(eq(pins.id, id))
  }

  if (typeof patch.addBoard === 'string') {
    await assertBoard(uid, patch.addBoard)
    await addToBoard(id, patch.addBoard)
  }
  if (typeof patch.removeBoard === 'string') {
    await db.delete(pinBoards).where(and(eq(pinBoards.pinId, id), eq(pinBoards.boardId, patch.removeBoard)))
  }
  return getView(uid, id)
}

export async function deletePin(uid: string, id: string): Promise<void> {
  const row = await getRow(uid, id)
  await db.delete(pins).where(eq(pins.id, id))
  await deleteImages([row.storageKey, row.thumbKey])
}

// ── Projects ──────────────────────────────────────────────────────────────────

function boardName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60) throw new PorcupinError('A project name is 1–60 characters')
  if (name.toLowerCase() === 'all') throw new PorcupinError('ALL is already the board of everything')
  return name
}

async function assertNameFree(uid: string, name: string, exceptId?: string): Promise<void> {
  const [clash] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(
      and(
        eq(boards.ownerUid, uid),
        eq(sql`lower(${boards.name})`, name.toLowerCase()),
        exceptId ? ne(boards.id, exceptId) : undefined,
      ),
    )
  if (clash) throw new PorcupinError(`There is already a project called ${name}`, 409)
}

export async function createBoard(uid: string, rawName: unknown): Promise<BoardView> {
  const name = boardName(rawName)
  await assertNameFree(uid, name)
  const [board] = await db
    .insert(boards)
    .values({ ownerUid: uid, name })
    .returning({ id: boards.id, name: boards.name })
  return board
}

export async function renameBoard(uid: string, id: string, rawName: unknown): Promise<BoardView> {
  const name = boardName(rawName)
  await assertBoard(uid, id)
  await assertNameFree(uid, name, id)
  await db.update(boards).set({ name }).where(eq(boards.id, id))
  return { id, name }
}

/** Removes the project only. Its photos stay, and are still in ALL. */
export async function deleteBoard(uid: string, id: string): Promise<void> {
  await assertBoard(uid, id)
  await db.delete(boards).where(eq(boards.id, id))
}

// ── Graph links ───────────────────────────────────────────────────────────────

const ORG_ID = /^[0-9a-fA-F-]{36}$/

function graphName(value: unknown): GraphName {
  if (value !== 'focus' && value !== 'quilt') throw new PorcupinError('graph must be focus or quilt')
  return value
}

export async function linkPin(
  uid: string,
  pinId: string,
  body: { graph?: unknown; nodeId?: unknown; label?: unknown },
): Promise<PinView> {
  await getRow(uid, pinId)
  const graph = graphName(body.graph)
  const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 300) : ''
  if (!nodeId || !label) throw new PorcupinError('nodeId and label are required')

  if (graph === 'focus') {
    if (!ORG_ID.test(nodeId)) throw new PorcupinError('nodeId must be an org id')
  } else {
    const [node] = await db
      .select({ id: graphNodes.id })
      .from(graphNodes)
      .where(and(eq(graphNodes.id, nodeId), eq(graphNodes.ownerUid, uid)))
    if (!node) throw notFound()
  }

  await db.insert(pinLinks).values({ pinId, graph, nodeId, nodeLabel: label }).onConflictDoNothing()
  return getView(uid, pinId)
}

export async function unlinkPin(uid: string, pinId: string, rawGraph: unknown, nodeId: string): Promise<PinView> {
  await getRow(uid, pinId)
  await db
    .delete(pinLinks)
    .where(and(eq(pinLinks.pinId, pinId), eq(pinLinks.graph, graphName(rawGraph)), eq(pinLinks.nodeId, nodeId)))
  return getView(uid, pinId)
}

export async function pinsForNode(uid: string, rawGraph: unknown, nodeId: string): Promise<LinkedPin[]> {
  return db
    .select({ id: pins.id, title: pins.title, filename: pins.filename })
    .from(pinLinks)
    .innerJoin(pins, eq(pins.id, pinLinks.pinId))
    .where(and(eq(pins.ownerUid, uid), eq(pinLinks.graph, graphName(rawGraph)), eq(pinLinks.nodeId, nodeId)))
    .orderBy(desc(pins.createdAt))
}

export type NodeHit = { graph: GraphName; nodeId: string; label: string }

const HITS_PER_GRAPH = 12

function byCloseness(q: string) {
  const needle = q.toLowerCase()
  return (a: NodeHit, b: NodeHit) => {
    const starts = Number(b.label.toLowerCase().startsWith(needle)) - Number(a.label.toLowerCase().startsWith(needle))
    return starts || a.label.length - b.label.length
  }
}

/**
 * Nodes from both graphs whose title matches. Quilt's mirrored flashcards are
 * left out: there are thousands, and their labels are whole questions.
 *
 * Focus is read from the notes, which need a linked Bluesky identity, so it can
 * be unavailable without Quilt being; that comes back as `focusAvailable: false`.
 */
export async function searchNodes(uid: string, q: string): Promise<{ hits: NodeHit[]; focusAvailable: boolean }> {
  const needle = q.toLowerCase()
  const closeness = byCloseness(q)

  const quiltRows = await db
    .select({ id: graphNodes.id, label: graphNodes.label })
    .from(graphNodes)
    .where(
      and(
        eq(graphNodes.ownerUid, uid),
        ilike(graphNodes.label, `%${q.replace(/[\\%_]/g, '\\$&')}%`),
        sql`${graphNodes.props}->>'kind' IS DISTINCT FROM 'Card'`,
      ),
    )
    .orderBy(asc(sql`length(${graphNodes.label})`))
    .limit(HITS_PER_GRAPH)
  const quilt = quiltRows.map((n): NodeHit => ({ graph: 'quilt', nodeId: n.id, label: n.label }))

  try {
    const did = await didForUser(uid)
    if (!did) return { hits: quilt.sort(closeness), focusAvailable: false }
    const focus = (await findNodes(did, q, HITS_PER_GRAPH * 3))
      .filter((n): n is typeof n & { orgId: string } => n.orgId !== null && n.title.toLowerCase().includes(needle))
      .map((n): NodeHit => ({ graph: 'focus', nodeId: n.orgId, label: n.title }))
      .sort(closeness)
      .slice(0, HITS_PER_GRAPH)
    return { hits: [...focus, ...quilt].sort(closeness), focusAvailable: true }
  } catch {
    return { hits: quilt.sort(closeness), focusAvailable: false }
  }
}
