/**
 * Docs in projects: plain documents written in Scatterbrain's editor.
 *
 * Each project (a top-level heading in a chain note) gets a Scatterbrain work
 * of its own, kind "docs", made when its first doc is. The project heading
 * keeps the work's id in DOCS_WORK. A doc is an item in that work, so it is
 * an ordinary Scatterbrain document too, with its snapshots, word counts and
 * compile. A doc made from a task is also listed on the task, in its DOCS
 * property (space-separated item ids).
 */
import { and, eq, inArray } from 'drizzle-orm'
import { getProperty, noteAt, setProperty, updateNoteAt, type Heading } from 'notes/server'
import { db } from '@/db'
import { sbItems as items, sbWorks as works } from '@/db/schema/scatterbrain'
import { createItem, createWork, updateWork } from '@/lib/scatterbrain/store'
import { didForUser } from '@/lib/notesHost'
import { DOMAINS } from './domains'
import { ChainError } from './errors'
import { pathOf } from './gtd'

const WORK = 'DOCS_WORK'
const ON_TASK = 'DOCS'

export type DocInfo = { id: string; workId: string; title: string; words: number; updatedAt: string }

const byChainId = (hs: Heading[], id: string) => hs.find((h) => getProperty(h, 'CHAIN_ID') === id)

async function headingAt(did: string, place: string, id: string): Promise<Heading> {
  const found = await noteAt(did, pathOf(place))
  const h = found && byChainId(found.note.headings, id)
  if (!h) throw new ChainError('That project or task is no longer there', 404)
  return h
}

/** The project's docs work, if it has one that still exists. */
async function workOf(uid: string, h: Heading): Promise<string | null> {
  const id = getProperty(h, WORK)
  if (!id) return null
  const [w] = await db.select({ id: works.id }).from(works).where(and(eq(works.id, id), eq(works.ownerUid, uid)))
  return w?.id ?? null
}

async function docsIn(uid: string, where: { workId?: string; ids?: string[] }): Promise<DocInfo[]> {
  if (!where.workId && !where.ids?.length) return []
  const rows = await db
    .select({ id: items.id, workId: items.workId, title: items.title, words: items.wordCount, updatedAt: items.updatedAt })
    .from(items)
    .innerJoin(works, eq(works.id, items.workId))
    .where(and(eq(works.ownerUid, uid), where.workId ? eq(items.workId, where.workId) : inArray(items.id, where.ids!)))
    .orderBy(items.position)
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))
}

/** A project's docs: everything in its docs work. */
export async function projectDocs(uid: string, did: string, place: string, frontId: string): Promise<{ workId: string | null; docs: DocInfo[] }> {
  const workId = await workOf(uid, await headingAt(did, place, frontId))
  return { workId, docs: workId ? await docsIn(uid, { workId }) : [] }
}

/** The docs made from a task. */
export async function taskDocs(uid: string, did: string, place: string, taskId: string): Promise<DocInfo[]> {
  const ids = (getProperty(await headingAt(did, place, taskId), ON_TASK) ?? '').split(/\s+/).filter(Boolean)
  return docsIn(uid, { ids })
}

/**
 * Makes a doc in a project (its docs work is made on the first one). With
 * `taskId`, the doc is listed on that task as well. Returns where it is.
 */
export async function newDoc(uid: string, did: string, place: string, frontId: string, title: string, taskId?: string): Promise<{ workId: string; id: string }> {
  const name = title.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  if (!name) throw new ChainError('Give the doc a name')
  const front = await headingAt(did, place, frontId)
  let workId = await workOf(uid, front)
  if (!workId) {
    workId = (await createWork(uid, { title: front.title.slice(0, 200) || 'Project', kind: 'docs' })).id
    await updateNoteAt(did, pathOf(place), (note) => {
      const h = byChainId(note.headings, frontId)
      if (!h) throw new ChainError('That project is no longer there', 404)
      setProperty(h, WORK, workId!)
    })
  }
  const { id } = await createItem(uid, workId, { kind: 'note', title: name })
  if (taskId && taskId !== frontId) {
    await updateNoteAt(did, pathOf(place), (note) => {
      const t = byChainId(note.headings, taskId)
      if (!t) throw new ChainError('That task is no longer there', 404)
      const list = (getProperty(t, ON_TASK) ?? '').split(/\s+/).filter(Boolean)
      setProperty(t, ON_TASK, [...list, id].join(' '))
    })
  }
  return { workId, id }
}

/** Takes a doc off a task's list. The doc itself stays in the project. */
export async function unlistTaskDoc(did: string, place: string, taskId: string, docId: string): Promise<void> {
  await updateNoteAt(did, pathOf(place), (note) => {
    const t = byChainId(note.headings, taskId)
    if (!t) throw new ChainError('That task is no longer there', 404)
    const list = (getProperty(t, ON_TASK) ?? '').split(/\s+/).filter((x) => x && x !== docId)
    setProperty(t, ON_TASK, list.length ? list.join(' ') : null)
  })
}

/**
 * Keeps a project and its docs work under one name: after a project is
 * renamed in Next, its work takes the name; after a docs work is renamed in
 * Scatterbrain, its project does. Either way, failing to follow is not an
 * error for the rename that was asked for.
 */
export async function followProjectRename(uid: string, did: string, place: string, id: string, title: string): Promise<void> {
  const h = await headingAt(did, place, id).catch(() => null)
  const workId = h && (await workOf(uid, h))
  if (workId) await updateWork(uid, workId, { title: title.slice(0, 200) }).catch(() => {})
}

export async function followWorkRename(uid: string, workId: string, title: string): Promise<void> {
  const did = await didForUser(uid)
  if (!did) return
  for (const d of DOMAINS) {
    const found = await noteAt(did, d.file)
    const h = found?.note.headings.find((x) => getProperty(x, WORK) === workId)
    if (!h) continue
    await updateNoteAt(did, d.file, (note) => {
      const same = note.headings.find((x) => getProperty(x, WORK) === workId)
      if (same) same.title = title
    }).catch(() => {})
    return
  }
}
