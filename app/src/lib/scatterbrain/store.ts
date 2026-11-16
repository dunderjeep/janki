import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { porcupinBoards, porcupinPinBoards, porcupinPins } from '@/db/schema/porcupin'
import {
  sbAttachments as attachments,
  sbCharacters as characters,
  sbItemCharacters as itemCharacters,
  sbItems as items,
  sbSnapshots as snapshots,
  sbWorks as works,
  type ItemKind,
  type ItemStatus,
} from '@/db/schema/scatterbrain'
import { linkPin, PorcupinError } from '@/lib/porcupin/store'
import { countWords, isHiddenLine } from './orgMarkdown'
import { readOrgFile, restoreOrgFile, saveOrgFile, type SaveRefusal } from './orgFiles'
import type { AttachmentView, BodyView, CharacterView, ItemView, SnapshotView, WorkBundle, WorkSummary, WorkView } from './types'

const notFound = () => new PorcupinError('Not found', 404)

const KINDS: ItemKind[] = ['part', 'act', 'chapter', 'scene', 'note']
const STATUSES: ItemStatus[] = ['idea', 'draft', 'revised', 'done']

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string') throw new PorcupinError(`${label} must be text`)
  if (value.length > max) throw new PorcupinError(`${label} is too long`)
  return value
}

function wordTarget(value: unknown): number | null {
  if (value === null || value === '') return null
  const target = Number(value)
  if (!Number.isInteger(target) || target <= 0 || target > 10_000_000) throw new PorcupinError('A target must be a whole number of words')
  return target
}

/** The server's calendar day, which is the writer's: this runs on their own machine. */
function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function title(value: unknown, label = 'Title'): string {
  const cleaned = text(value, 300, label).trim()
  if (!cleaned) throw new PorcupinError(`${label} cannot be empty`)
  return cleaned
}

// ── Ownership ────────────────────────────────────────────────────────────────

async function ownedWork(uid: string, workId: string) {
  const [work] = await db.select().from(works).where(and(eq(works.id, workId), eq(works.ownerUid, uid)))
  if (!work) throw notFound()
  return work
}

async function ownedItem(uid: string, itemId: string) {
  const [row] = await db
    .select({ item: items })
    .from(items)
    .innerJoin(works, eq(items.workId, works.id))
    .where(and(eq(items.id, itemId), eq(works.ownerUid, uid)))
  if (!row) throw notFound()
  return row.item
}

async function ownedCharacter(uid: string, characterId: string) {
  const [row] = await db
    .select({ character: characters })
    .from(characters)
    .innerJoin(works, eq(characters.workId, works.id))
    .where(and(eq(characters.id, characterId), eq(works.ownerUid, uid)))
  if (!row) throw notFound()
  return row.character
}

// ── Works ────────────────────────────────────────────────────────────────────

/**
 * The outer works row, written out in full: inside a subquery Drizzle prints
 * works.id as a bare "id", which then means the inner table's own id.
 */
const W = sql.raw('"scatterbrain"."works"')

/** Research notes don't count toward a book; in a docs work (a project's docs) the notes are the writing. */
const wordTotal = sql<number>`coalesce((
  select sum(i.word_count) from scatterbrain.items i where i.work_id = ${W}.id and (i.kind <> 'note' or ${W}.kind = 'docs')
), 0)::int`

/**
 * The picture on its card: the top image of the document you were last in,
 * else the work's own cover, else the first picture hung anywhere in it.
 */
const coverPin = sql<string | null>`coalesce((
  select a.pin_id from scatterbrain.attachments a where a.item_id = ${W}.last_item_id
  order by a.position, a.created_at limit 1
), ${W}.cover_pin_id, (
  select a.pin_id from scatterbrain.attachments a where a.work_id = ${W}.id
  order by a.created_at limit 1
))`

/** The document you were last in, by name. */
const lastItemTitle = sql<string | null>`(select i.title from scatterbrain.items i where i.id = ${W}.last_item_id)`

const summaryColumns = {
  id: works.id,
  title: works.title,
  kind: works.kind,
  logline: works.logline,
  coverPinId: coverPin,
  wordCount: wordTotal,
  targetWords: works.targetWords,
  lastOpenedAt: works.lastOpenedAt,
  lastItemTitle,
}

type SummaryRow = Omit<WorkSummary, 'lastOpenedAt'> & { lastOpenedAt: Date }
const toSummary = (row: SummaryRow): WorkSummary => ({ ...row, lastOpenedAt: row.lastOpenedAt.toISOString() })

export async function listWorks(uid: string): Promise<WorkSummary[]> {
  const rows = await db.select(summaryColumns).from(works).where(eq(works.ownerUid, uid)).orderBy(desc(works.lastOpenedAt))
  return rows.map(toSummary)
}

/** The work most recently opened. */
export async function currentWork(uid: string): Promise<WorkSummary | null> {
  const [row] = await db.select(summaryColumns).from(works).where(eq(works.ownerUid, uid)).orderBy(desc(works.lastOpenedAt)).limit(1)
  return row ? toSummary(row) : null
}

export async function createWork(uid: string, body: { title?: unknown; kind?: unknown; logline?: unknown }) {
  const kind = typeof body.kind === 'string' ? body.kind : 'novel'
  return db.transaction(async (tx) => {
    const [work] = await tx
      .insert(works)
      .values({
        ownerUid: uid,
        title: title(body.title),
        kind,
        logline: body.logline === undefined ? '' : text(body.logline, 500, 'Logline'),
      })
      .returning({ id: works.id })

    const add = async (parentId: string | null, itemKind: ItemKind, itemTitle: string) => {
      const [item] = await tx.insert(items).values({ workId: work.id, parentId, kind: itemKind, title: itemTitle }).returning({ id: items.id })
      return item.id
    }
    if (kind === 'novel') {
      const act = await add(null, 'act', 'Act I')
      await add(await add(act, 'chapter', 'Chapter 1'), 'scene', 'Scene 1')
    } else if (kind === 'story') await add(null, 'scene', 'Opening')
    else if (kind === 'essay') await add(null, 'scene', 'Introduction')
    return { id: work.id }
  })
}

export async function updateWork(
  uid: string,
  workId: string,
  patch: { title?: unknown; logline?: unknown; notes?: unknown; targetWords?: unknown; sessionTarget?: unknown; resetSession?: unknown; coverPinId?: unknown; kind?: unknown },
): Promise<void> {
  const work = await ownedWork(uid, workId)
  const set: Partial<typeof works.$inferInsert> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = title(patch.title)
  if (patch.logline !== undefined) set.logline = text(patch.logline, 500, 'Logline')
  if (patch.notes !== undefined) set.notes = text(patch.notes, 500_000, 'Notes')
  if (patch.kind !== undefined) set.kind = text(patch.kind, 40, 'Kind')
  if (patch.targetWords !== undefined) set.targetWords = wordTarget(patch.targetWords)
  if (patch.sessionTarget !== undefined) set.sessionTarget = wordTarget(patch.sessionTarget)
  if (patch.resetSession === true) {
    set.sessionWords = 0
    set.sessionDay = today()
  }
  if (patch.coverPinId !== undefined) {
    if (patch.coverPinId !== null) await assertPin(uid, text(patch.coverPinId, 64, 'Cover'))
    set.coverPinId = patch.coverPinId as string | null
  }
  await db.update(works).set(set).where(eq(works.id, workId))

  // Keep the Porcupin project's name in step, unless another project has that name.
  if (set.title && work.boardId) {
    await db.update(porcupinBoards).set({ name: boardName(set.title) }).where(eq(porcupinBoards.id, work.boardId)).catch(() => {})
  }
}

/** Removes the work. Org files and Porcupin images are not part of it and stay. */
export async function deleteWork(uid: string, workId: string): Promise<void> {
  await ownedWork(uid, workId)
  await db.delete(works).where(eq(works.id, workId))
}

/** Records the work as open, and optionally where in it you are. */
export async function markOpened(uid: string, workId: string, place: { itemId?: string; view?: string } = {}): Promise<void> {
  await ownedWork(uid, workId)
  const set: Partial<typeof works.$inferInsert> = { lastOpenedAt: new Date() }
  if (typeof place.itemId === 'string') set.lastItemId = place.itemId
  if (typeof place.view === 'string') set.lastView = place.view
  await db.update(works).set(set).where(eq(works.id, workId))
}

export async function loadWork(uid: string, workId: string): Promise<WorkBundle> {
  const work = await ownedWork(uid, workId)
  const [itemRows, castRows, characterRows, attachmentRows, allWorks] = await Promise.all([
    db
      .select({
        id: items.id,
        parentId: items.parentId,
        kind: items.kind,
        title: items.title,
        synopsis: items.synopsis,
        notes: items.notes,
        status: items.status,
        orgPath: items.orgPath,
        povCharacterId: items.povCharacterId,
        wordCount: items.wordCount,
        targetWords: items.targetWords,
        position: items.position,
      })
      .from(items)
      .where(eq(items.workId, workId))
      .orderBy(asc(items.position), asc(items.createdAt)),
    db
      .select({ itemId: itemCharacters.itemId, characterId: itemCharacters.characterId })
      .from(itemCharacters)
      .innerJoin(items, eq(itemCharacters.itemId, items.id))
      .where(eq(items.workId, workId)),
    db.select().from(characters).where(eq(characters.workId, workId)).orderBy(asc(characters.position), asc(characters.createdAt)),
    attachmentViews(eq(attachments.workId, workId)),
    listWorks(uid),
  ])

  const cast = new Map<string, string[]>()
  for (const row of castRows) cast.set(row.itemId, [...(cast.get(row.itemId) ?? []), row.characterId])

  const summary = allWorks.find((w) => w.id === workId)!
  const view: WorkView = {
    ...summary,
    notes: work.notes,
    sessionTarget: work.sessionTarget,
    sessionWords: work.sessionDay === today() ? work.sessionWords : 0,
    boardId: work.boardId,
    lastItemId: work.lastItemId,
    lastView: work.lastView,
  }
  return {
    work: view,
    items: itemRows.map((row): ItemView => ({ ...row, characterIds: cast.get(row.id) ?? [] })),
    characters: characterRows.map((c): CharacterView => ({ id: c.id, name: c.name, role: c.role, description: c.description, position: c.position })),
    attachments: attachmentRows,
    works: allWorks,
  }
}

// ── Porcupin ─────────────────────────────────────────────────────────────────

const boardName = (workTitle: string) => `Scatterbrain: ${workTitle}`.slice(0, 120)

async function assertPin(uid: string, pinId: string) {
  const [pin] = await db.select().from(porcupinPins).where(and(eq(porcupinPins.id, pinId), eq(porcupinPins.ownerUid, uid)))
  if (!pin) throw notFound()
  return pin
}

/** The work's Porcupin project, made the first time it gets an image. */
export async function ensureBoard(uid: string, workId: string): Promise<string> {
  const work = await ownedWork(uid, workId)
  if (work.boardId) return work.boardId

  const base = boardName(work.title)
  let boardId: string | null = null
  for (let attempt = 1; !boardId && attempt < 50; attempt++) {
    const name = attempt === 1 ? base : `${base} (${attempt})`
    const [made] = await db.insert(porcupinBoards).values({ ownerUid: uid, name }).onConflictDoNothing().returning({ id: porcupinBoards.id })
    boardId = made?.id ?? null
  }
  if (!boardId) throw new PorcupinError('Could not make a Porcupin project for this work', 500)
  await db.update(works).set({ boardId }).where(eq(works.id, workId))
  return boardId
}

function attachmentViews(where: ReturnType<typeof eq>): Promise<AttachmentView[]> {
  return db
    .select({
      id: attachments.id,
      itemId: attachments.itemId,
      characterId: attachments.characterId,
      pinId: attachments.pinId,
      caption: attachments.caption,
      position: attachments.position,
      title: porcupinPins.title,
      filename: porcupinPins.filename,
      description: porcupinPins.description,
      sourceUrl: porcupinPins.sourceUrl,
    })
    .from(attachments)
    .innerJoin(porcupinPins, eq(attachments.pinId, porcupinPins.id))
    .where(where)
    .orderBy(asc(attachments.position), asc(attachments.createdAt))
}

/**
 * Hangs a Porcupin pin on the work, an item or a character. The pin joins the
 * work's Porcupin project, picks up a title and description if it lacks them,
 * and, when the item is an org-roam note, is linked to that note in Focus.
 */
export async function attachPin(
  uid: string,
  body: { workId?: unknown; pinId?: unknown; itemId?: unknown; characterId?: unknown; caption?: unknown },
): Promise<AttachmentView> {
  const workId = text(body.workId, 64, 'workId')
  const pinId = text(body.pinId, 64, 'pinId')
  const work = await ownedWork(uid, workId)
  await assertPin(uid, pinId)

  const item = typeof body.itemId === 'string' ? await ownedItem(uid, body.itemId) : null
  const character = typeof body.characterId === 'string' ? await ownedCharacter(uid, body.characterId) : null
  if ((item && item.workId !== workId) || (character && character.workId !== workId)) throw notFound()
  if (item && character) throw new PorcupinError('An image hangs on one thing at a time')

  const target = and(
    eq(attachments.workId, workId),
    eq(attachments.pinId, pinId),
    item ? eq(attachments.itemId, item.id) : isNull(attachments.itemId),
    character ? eq(attachments.characterId, character.id) : isNull(attachments.characterId),
  )!
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${attachments.position}) + 1, 0)::int` })
    .from(attachments)
    .where(and(eq(attachments.workId, workId), item ? eq(attachments.itemId, item.id) : isNull(attachments.itemId), character ? eq(attachments.characterId, character.id) : isNull(attachments.characterId)))
  await db
    .insert(attachments)
    .values({
      workId,
      pinId,
      itemId: item?.id ?? null,
      characterId: character?.id ?? null,
      position: next,
      caption: body.caption === undefined ? '' : text(body.caption, 1000, 'Caption'),
    })
    .onConflictDoNothing()

  const boardId = await ensureBoard(uid, workId)
  await db.insert(porcupinPinBoards).values({ pinId, boardId }).onConflictDoNothing()

  const about = character ? `${character.name}, a character in ${work.title}` : item ? `${item.title}, in ${work.title}` : work.title
  await db
    .update(porcupinPins)
    .set({
      title: sql`coalesce(${porcupinPins.title}, ${character?.name ?? item?.title ?? work.title})`,
      description: sql`coalesce(${porcupinPins.description}, ${`From Scatterbrain: ${about}`})`,
      updatedAt: new Date(),
    })
    .where(eq(porcupinPins.id, pinId))

  if (item?.orgPath) {
    const file = await readOrgFile(uid, item.orgPath).catch(() => null)
    if (file?.nodeId) {
      await linkPin(uid, pinId, { graph: 'focus', nodeId: file.nodeId, label: file.title ?? item.title }).catch(() => {})
    }
  }

  const [view] = await attachmentViews(target)
  return view
}

async function ownedAttachment(uid: string, id: string) {
  const [row] = await db
    .select({ attachment: attachments })
    .from(attachments)
    .innerJoin(works, eq(attachments.workId, works.id))
    .where(and(eq(attachments.id, id), eq(works.ownerUid, uid)))
  if (!row) throw notFound()
  return row.attachment
}

export async function updateAttachment(uid: string, id: string, patch: { caption?: unknown; first?: unknown }): Promise<void> {
  const row = await ownedAttachment(uid, id)
  if (patch.caption !== undefined) {
    await db.update(attachments).set({ caption: text(patch.caption, 1000, 'Caption') }).where(eq(attachments.id, id))
  }
  if (patch.first === true) {
    // The first image of a character is their portrait.
    const [{ lowest }] = await db
      .select({ lowest: sql<number>`coalesce(min(${attachments.position}), 0)::int` })
      .from(attachments)
      .where(and(eq(attachments.workId, row.workId), row.characterId ? eq(attachments.characterId, row.characterId) : isNull(attachments.characterId), row.itemId ? eq(attachments.itemId, row.itemId) : isNull(attachments.itemId)))
    await db.update(attachments).set({ position: lowest - 1 }).where(eq(attachments.id, id))
  }
}

/** Takes the image off here. It stays in Porcupin. */
export async function detachPin(uid: string, id: string): Promise<void> {
  await ownedAttachment(uid, id)
  await db.delete(attachments).where(eq(attachments.id, id))
}

// ── Binder ───────────────────────────────────────────────────────────────────

export async function createItem(
  uid: string,
  workId: string,
  body: { parentId?: unknown; kind?: unknown; title?: unknown; orgPath?: unknown },
): Promise<{ id: string; created: boolean }> {
  await ownedWork(uid, workId)
  const parentId = typeof body.parentId === 'string' ? body.parentId : null
  if (parentId) {
    const parent = await ownedItem(uid, parentId)
    if (parent.workId !== workId) throw notFound()
  }
  const kind = (KINDS as unknown[]).includes(body.kind) ? (body.kind as ItemKind) : 'scene'

  let orgPath: string | null = null
  let itemTitle = body.title === undefined ? `New ${kind}` : title(body.title)
  let wordCount = 0
  if (typeof body.orgPath === 'string') {
    orgPath = body.orgPath
    const [existing] = await db.select({ id: items.id }).from(items).where(and(eq(items.workId, workId), eq(items.orgPath, orgPath)))
    if (existing) return { id: existing.id, created: false }
    const file = await readOrgFile(uid, orgPath)
    if (body.title === undefined) {
      itemTitle = file.title ?? orgPath.split('/').pop()!.replace(/\.(org|md)$/, '').replace(/^\d{14}-/, '').replace(/_/g, ' ')
    }
    wordCount = file.wordCount
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${items.position}) + 1, 0)::int` })
    .from(items)
    .where(and(eq(items.workId, workId), parentId ? eq(items.parentId, parentId) : isNull(items.parentId)))
  const [item] = await db
    .insert(items)
    .values({ workId, parentId, kind, title: itemTitle, orgPath, wordCount, position: next, status: orgPath ? 'draft' : 'idea' })
    .returning({ id: items.id })
  return { id: item.id, created: true }
}

export async function updateItem(
  uid: string,
  itemId: string,
  patch: { title?: unknown; kind?: unknown; synopsis?: unknown; notes?: unknown; status?: unknown; povCharacterId?: unknown; characterIds?: unknown; orgPath?: unknown; targetWords?: unknown },
): Promise<void> {
  const item = await ownedItem(uid, itemId)
  const set: Partial<typeof items.$inferInsert> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = title(patch.title)
  if (patch.synopsis !== undefined) set.synopsis = text(patch.synopsis, 5000, 'Synopsis')
  if (patch.notes !== undefined) set.notes = text(patch.notes, 500_000, 'Notes')
  if (patch.targetWords !== undefined) set.targetWords = wordTarget(patch.targetWords)
  if (patch.kind !== undefined) {
    if (!(KINDS as unknown[]).includes(patch.kind)) throw new PorcupinError('Unknown kind')
    set.kind = patch.kind as ItemKind
  }
  if (patch.status !== undefined) {
    if (!(STATUSES as unknown[]).includes(patch.status)) throw new PorcupinError('Unknown status')
    set.status = patch.status as ItemStatus
  }
  if (patch.povCharacterId !== undefined) {
    if (patch.povCharacterId !== null) {
      const character = await ownedCharacter(uid, text(patch.povCharacterId, 64, 'POV'))
      if (character.workId !== item.workId) throw notFound()
    }
    set.povCharacterId = patch.povCharacterId as string | null
  }
  // Unlinking keeps a copy of the text here; the file itself is left as it is.
  if (patch.orgPath === null && item.orgPath) {
    const file = await readOrgFile(uid, item.orgPath)
    set.orgPath = null
    set.body = file.markdown.split('\n').filter((l) => !isHiddenLine(l)).join('\n')
  }
  await db.update(items).set(set).where(eq(items.id, itemId))

  if (Array.isArray(patch.characterIds)) {
    const ids = patch.characterIds.filter((c): c is string => typeof c === 'string')
    const valid = ids.length
      ? await db.select({ id: characters.id }).from(characters).where(and(eq(characters.workId, item.workId), inArray(characters.id, ids)))
      : []
    await db.transaction(async (tx) => {
      await tx.delete(itemCharacters).where(eq(itemCharacters.itemId, itemId))
      if (valid.length) await tx.insert(itemCharacters).values(valid.map((c) => ({ itemId, characterId: c.id })))
    })
  }
}

/** Deletes an item and what is under it. Linked org files are left on disk. */
export async function deleteItem(uid: string, itemId: string): Promise<void> {
  await ownedItem(uid, itemId)
  await db.delete(items).where(eq(items.id, itemId))
}

/** Places an item under `parentId`, before `beforeId` or else last. */
export async function moveItem(uid: string, itemId: string, body: { parentId?: unknown; beforeId?: unknown }): Promise<void> {
  const item = await ownedItem(uid, itemId)
  const parentId = typeof body.parentId === 'string' ? body.parentId : null
  const beforeId = typeof body.beforeId === 'string' ? body.beforeId : null
  if (beforeId === itemId) return

  const all = await db.select({ id: items.id, parentId: items.parentId }).from(items).where(eq(items.workId, item.workId))
  const parentOf = new Map(all.map((row) => [row.id, row.parentId]))
  if (parentId && !parentOf.has(parentId)) throw notFound()
  for (let at: string | null = parentId; at; at = parentOf.get(at) ?? null) {
    if (at === itemId) throw new PorcupinError('Something cannot be moved inside itself')
  }

  await db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.workId, item.workId), parentId ? eq(items.parentId, parentId) : isNull(items.parentId), ne(items.id, itemId)))
      .orderBy(asc(items.position), asc(items.createdAt))
    const order = siblings.map((s) => s.id)
    const at = beforeId ? order.indexOf(beforeId) : -1
    order.splice(at < 0 ? order.length : at, 0, itemId)
    await Promise.all(
      order.map((id, position) =>
        tx.update(items).set(id === itemId ? { position, parentId, updatedAt: new Date() } : { position }).where(eq(items.id, id)),
      ),
    )
  })
}

// ── Text ─────────────────────────────────────────────────────────────────────

/** Snapshots taken on their own: at most one per interval, and only so many kept. */
const AUTO_SNAPSHOT_EVERY_MS = 10 * 60 * 1000
const AUTO_SNAPSHOTS_KEPT = 40

async function autoSnapshot(itemId: string, body: string, isFileText: boolean): Promise<void> {
  if (!body.trim()) return
  const [latest] = await db
    .select({ createdAt: snapshots.createdAt })
    .from(snapshots)
    .where(and(eq(snapshots.itemId, itemId), eq(snapshots.kind, 'auto')))
    .orderBy(desc(snapshots.createdAt))
    .limit(1)
  if (latest && Date.now() - latest.createdAt.getTime() < AUTO_SNAPSHOT_EVERY_MS) return
  await db.insert(snapshots).values({ itemId, body, isFileText, kind: 'auto' })

  const expired = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(and(eq(snapshots.itemId, itemId), eq(snapshots.kind, 'auto')))
    .orderBy(desc(snapshots.createdAt))
    .offset(AUTO_SNAPSHOTS_KEPT)
  if (expired.length) await db.delete(snapshots).where(inArray(snapshots.id, expired.map((row) => row.id)))
}

export async function readBody(uid: string, itemId: string): Promise<BodyView> {
  const item = await ownedItem(uid, itemId)
  if (!item.orgPath) return { markdown: item.body, sha: null, orgPath: null, fileTitle: null, missing: false }
  try {
    const file = await readOrgFile(uid, item.orgPath)
    if (file.wordCount !== item.wordCount) await db.update(items).set({ wordCount: file.wordCount }).where(eq(items.id, itemId))
    return { markdown: file.markdown, sha: file.sha, orgPath: item.orgPath, fileTitle: file.title, missing: false }
  } catch (err) {
    if (err instanceof PorcupinError && err.status === 404) {
      return { markdown: '', sha: null, orgPath: item.orgPath, fileTitle: null, missing: true }
    }
    throw err
  }
}

export type SaveResult = SaveRefusal | { sha: string | null; wordCount: number; sessionWords: number }

/** Adds a save's change in words to today's session, and returns today's total. Notes do not count. */
async function addToSession(item: { workId: string; kind: ItemKind; wordCount: number }, wordCount: number): Promise<number> {
  const day = today()
  const delta = item.kind === 'note' ? 0 : wordCount - item.wordCount
  const [row] = await db
    .update(works)
    .set({
      sessionWords: sql`(case when ${works.sessionDay} = ${day} then ${works.sessionWords} else 0 end) + ${delta}::int`,
      sessionDay: day,
    })
    .where(eq(works.id, item.workId))
    .returning({ sessionWords: works.sessionWords })
  return row.sessionWords
}

export async function saveBody(
  uid: string,
  itemId: string,
  body: { markdown?: unknown; expectedSha?: unknown; force?: unknown },
): Promise<SaveResult> {
  const item = await ownedItem(uid, itemId)
  const markdown = text(body.markdown, 5_000_000, 'Text')

  if (item.orgPath) {
    const result = await saveOrgFile(uid, item.orgPath, markdown, typeof body.expectedSha === 'string' ? body.expectedSha : null, body.force === true)
    if ('conflict' in result) return result
    if (result.changed) await autoSnapshot(itemId, result.previous, true)
    const sessionWords = await addToSession(item, result.wordCount)
    await db.update(items).set({ wordCount: result.wordCount, updatedAt: new Date() }).where(eq(items.id, itemId))
    return { sha: result.sha, wordCount: result.wordCount, sessionWords }
  }

  if (item.body !== markdown) await autoSnapshot(itemId, item.body, false)
  const wordCount = countWords(markdown)
  const sessionWords = await addToSession(item, wordCount)
  await db.update(items).set({ body: markdown, wordCount, updatedAt: new Date() }).where(eq(items.id, itemId))
  return { sha: null, wordCount, sessionWords }
}

// ── Snapshots ────────────────────────────────────────────────────────────────

export async function listSnapshots(uid: string, itemId: string): Promise<SnapshotView[]> {
  await ownedItem(uid, itemId)
  const rows = await db.select().from(snapshots).where(eq(snapshots.itemId, itemId)).orderBy(desc(snapshots.createdAt)).limit(100)
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    preview: row.body.slice(0, 2000),
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function takeSnapshot(uid: string, itemId: string, label: unknown): Promise<void> {
  const item = await ownedItem(uid, itemId)
  const body = item.orgPath ? (await readOrgFile(uid, item.orgPath)).raw : item.body
  await db.insert(snapshots).values({ itemId, body, isFileText: !!item.orgPath, kind: 'manual', label: typeof label === 'string' ? label.trim().slice(0, 200) : '' })
}

/** Puts an old version back, saving what was there first so restoring can be undone. */
export async function restoreSnapshot(uid: string, snapshotId: string): Promise<SaveRefusal | { ok: true }> {
  const [row] = await db
    .select({ snapshot: snapshots, item: items })
    .from(snapshots)
    .innerJoin(items, eq(snapshots.itemId, items.id))
    .innerJoin(works, eq(items.workId, works.id))
    .where(and(eq(snapshots.id, snapshotId), eq(works.ownerUid, uid)))
  if (!row) throw notFound()
  const { snapshot, item } = row
  const undoLabel = 'Before restoring an earlier version'

  if (item.orgPath && snapshot.isFileText) {
    const result = await restoreOrgFile(uid, item.orgPath, snapshot.body)
    if ('conflict' in result) return result
    await db.insert(snapshots).values({ itemId: item.id, body: result.previous, isFileText: true, kind: 'manual', label: undoLabel })
    const file = await readOrgFile(uid, item.orgPath)
    await db.update(items).set({ wordCount: file.wordCount, updatedAt: new Date() }).where(eq(items.id, item.id))
    return { ok: true }
  }
  if (item.orgPath || snapshot.isFileText) {
    throw new PorcupinError('That version was saved before this item was linked or unlinked, so it cannot be restored here')
  }

  await db.insert(snapshots).values({ itemId: item.id, body: item.body, kind: 'manual', label: undoLabel })
  await db.update(items).set({ body: snapshot.body, wordCount: countWords(snapshot.body), updatedAt: new Date() }).where(eq(items.id, item.id))
  return { ok: true }
}

// ── Characters ───────────────────────────────────────────────────────────────

export async function createCharacter(uid: string, workId: string, body: { name?: unknown; role?: unknown }): Promise<CharacterView> {
  await ownedWork(uid, workId)
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${characters.position}) + 1, 0)::int` })
    .from(characters)
    .where(eq(characters.workId, workId))
  const [row] = await db
    .insert(characters)
    .values({ workId, name: title(body.name, 'Name'), role: body.role === undefined ? '' : text(body.role, 200, 'Role'), position: next })
    .returning()
  return { id: row.id, name: row.name, role: row.role, description: row.description, position: row.position }
}

export async function updateCharacter(uid: string, id: string, patch: { name?: unknown; role?: unknown; description?: unknown }): Promise<void> {
  await ownedCharacter(uid, id)
  const set: Partial<typeof characters.$inferInsert> = {}
  if (patch.name !== undefined) set.name = title(patch.name, 'Name')
  if (patch.role !== undefined) set.role = text(patch.role, 200, 'Role')
  if (patch.description !== undefined) set.description = text(patch.description, 100_000, 'Description')
  if (Object.keys(set).length) await db.update(characters).set(set).where(eq(characters.id, id))
}

export async function deleteCharacter(uid: string, id: string): Promise<void> {
  await ownedCharacter(uid, id)
  await db.delete(characters).where(eq(characters.id, id))
}

// ── Compile ──────────────────────────────────────────────────────────────────

/** The manuscript as one Markdown document, in binder order, notes left out. */
export async function compileWork(uid: string, workId: string): Promise<{ title: string; markdown: string }> {
  const work = await ownedWork(uid, workId)
  const rows = await db.select().from(items).where(eq(items.workId, workId)).orderBy(asc(items.position), asc(items.createdAt))
  const children = new Map<string | null, typeof rows>()
  for (const row of rows) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row])

  const out: string[] = [`# ${work.title}`]
  const walk = async (parentId: string | null, depth: number): Promise<void> => {
    for (const item of children.get(parentId) ?? []) {
      if (item.kind === 'note') continue
      out.push(`${'#'.repeat(Math.min(depth + 2, 6))} ${item.title}`)
      const body = item.orgPath ? (await readOrgFile(uid, item.orgPath).catch(() => null))?.markdown ?? '' : item.body
      const visible = body.split('\n').filter((line) => !isHiddenLine(line)).join('\n').trim()
      if (visible) out.push(visible)
      await walk(item.id, depth + 1)
    }
  }
  await walk(null, 0)
  return { title: work.title, markdown: out.join('\n\n') + '\n' }
}

