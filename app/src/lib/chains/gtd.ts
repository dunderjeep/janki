/**
 * Getting Things Done, over the chain notes.
 *
 * The inbox is a note too (inbox.org): each top-level heading is a captured
 * thing, with no TODO keyword until it is processed. Processing one asks the
 * GTD question (what is it, and what's the next action?) and the answer moves
 * it: into the two-minute Now queue, a project, waiting-for, someday/maybe, a
 * note of its own, or the bin. Or it is snoozed, and comes back to the inbox
 * on its day. In org terms, see tree.ts.
 */
import { randomUUID } from 'node:crypto'
import {
  blobCid, CID, createNote, getProperty, noteAt, notesHost, nowStamp, setProperty, timestampText, updateNoteAt,
  type Attachment, type Heading, type NoteRecord,
} from 'notes/server'
import { DOMAINS, domainFor } from './domains'
import { ChainError } from './errors'
import { addHeading, applyField, deleteHeading, readChains, refile, removeHeading, seedChains, setAttachments, snoozeHeading, WHEN } from './notesChains'
import { buildTree, snoozed, type AttachmentInfo, type ChainNode } from './tree'

export const INBOX = process.env.NOTES_INBOX ?? 'inbox.org'
const INBOX_SEED = '#+title: Inbox\n'

/** The note a GTD "place" names: "inbox", or a domain key such as "life". */
export function pathOf(place: string): string {
  if (place === 'inbox') return INBOX
  const d = domainFor(place)
  if (!d) throw new ChainError(`No such list: ${place}`, 404)
  return d.file
}

export type InboxItem = {
  id: string
  title: string
  /** When it was captured, as org wrote it. */
  created: string | null
  /** The day a snoozed item comes back, or null. */
  until: string | null
  attachments: AttachmentInfo[]
  /** Anything written under it, or under headings below it. */
  hasDetail: boolean
}

export type InboxView = { items: InboxItem[]; snoozed: InboxItem[]; lastReview: string | null }

export async function inboxView(did: string, today: string): Promise<InboxView> {
  await createNote(did, INBOX, INBOX_SEED)
  const [flat, found] = await Promise.all([readChains(did, INBOX), noteAt(did, INBOX)])
  const note = found!.note
  const items: InboxItem[] = []
  const later: InboxItem[] = []
  for (const n of buildTree(flat)) {
    if (n.done) continue
    const h = note.headings.find((x) => getProperty(x, 'CHAIN_ID') === n.id)
    const item: InboxItem = {
      id: n.id, title: n.title, created: h ? getProperty(h, 'CREATED') : null, until: snoozed(n, today) ? n.snoozeDate : null,
      attachments: n.attachments, hasDetail: Boolean(h?.body?.trim()) || n.children.length > 0,
    }
    ;(item.until ? later : items).push(item)
  }
  return { items, snoozed: later, lastReview: getProperty({ level: 0, title: '', properties: note.properties }, 'LAST_REVIEW') }
}

/** Puts a thing in the inbox. Returns its CHAIN_ID. */
export async function capture(did: string, title: string, detail?: string): Promise<string> {
  const id = randomUUID()
  await updateNoteAt(did, INBOX, (note) => {
    note.headings.push({
      level: 1,
      title,
      properties: [{ key: 'CHAIN_ID', value: id }, { key: 'CREATED', value: timestampText(nowStamp()) }],
      ...(detail?.trim() ? { body: detail.trim() } : {}),
    })
  }, { create: () => ({ $type: 'com.dunderjeep.janki.note', title: 'Inbox', path: INBOX, headings: [], createdAt: new Date().toISOString() }) })
  return id
}

/** What processing an inbox item (or re-filing any task) decides. */
export type Decision =
  /** Two minutes or less: into the Now queue, to do straight away. */
  | { kind: 'now' }
  /** A single next action, in a list or a project. */
  | { kind: 'next'; place: string; parent?: string | null; contexts?: string; effort?: string; energy?: string }
  /** More than one step: a project, with its first step if you know it. */
  | { kind: 'project'; place: string; firstStep?: string }
  /** Someone else's move. */
  | { kind: 'waiting'; place: string; parent?: string | null; who: string }
  /** Not now: back in the inbox on that day. */
  | { kind: 'snooze'; until: string }
  /** Maybe one day. */
  | { kind: 'someday'; place: string }
  /** Not a task at all: something to keep. Becomes a note of its own. */
  | { kind: 'note' }
  | { kind: 'trash' }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A file name for a new note from its title: lowercase words joined by underscores, as org-roam names them. */
function slug(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'note'
}

/**
 * Processes inbox item `id`. Returns where it went, in words, for the page to
 * say, and the path of a note made from it.
 */
export async function processItem(did: string, id: string, d: Decision): Promise<{ said: string; note?: string }> {
  switch (d.kind) {
    case 'now':
      await refile(did, INBOX, id, pathOf('life'), null, (h) => {
        applyField(h, 'todo', 'TODO')
        applyField(h, 'now', 't')
      })
      return { said: 'Into Now: do it straight away' }
    case 'next': {
      const effort = d.effort ?? ''
      if (effort && !/^(\d{1,2}:\d{2}|\d{1,4})$/.test(effort)) throw new ChainError('Time is minutes or H:MM')
      await refile(did, INBOX, id, pathOf(d.place), d.parent ?? null, (h) => {
        applyField(h, 'todo', 'TODO')
        if (d.contexts) applyField(h, 'contexts', d.contexts)
        if (effort) applyField(h, 'EFFORT', effort)
        if (d.energy) applyField(h, 'ENERGY', d.energy)
      })
      return { said: 'Now a next action' }
    }
    case 'project': {
      await refile(did, INBOX, id, pathOf(d.place), null, (h) => { delete h.todo })
      if (d.firstStep?.trim()) await addHeading(did, pathOf(d.place), id, 'last', d.firstStep.trim(), 'TODO')
      return { said: d.firstStep?.trim() ? 'Now a project, with its first step' : 'Now a project: give it a first step' }
    }
    case 'waiting':
      if (!d.who.trim()) throw new ChainError('Say who or what it waits for')
      await refile(did, INBOX, id, pathOf(d.place), d.parent ?? null, (h) => {
        applyField(h, 'todo', 'WAIT')
        applyField(h, 'WAITING_ON', d.who.trim().slice(0, 120))
      })
      return { said: `Waiting for ${d.who.trim()}` }
    case 'snooze':
      if (!DAY.test(d.until)) throw new ChainError('Snooze needs a day')
      await snooze(did, 'inbox', id, d.until)
      return { said: `Back in the inbox on ${d.until}` }
    case 'someday':
      await refile(did, INBOX, id, pathOf(d.place), null, (h) => applyField(h, 'todo', 'SOMEDAY'))
      return { said: 'Someday/maybe' }
    case 'note': {
      const found = await noteAt(did, INBOX)
      const h = found?.note.headings.find((x) => getProperty(x, 'CHAIN_ID') === id)
      if (!h) throw new ChainError('That item is no longer in the inbox', 404)
      let path = `${slug(h.title)}.org`
      for (let n = 2; await noteAt(did, path); n++) path = `${slug(h.title)}_${n}.org`
      const made: NoteRecord = {
        $type: 'com.dunderjeep.janki.note',
        title: h.title,
        path,
        properties: [{ key: 'ID', value: randomUUID() }],
        ...(h.body ? { body: h.body } : {}),
        headings: [],
        createdAt: new Date().toISOString(),
      }
      await updateNoteAt(did, path, () => undefined, { create: () => made })
      // It lives on as the note, so it leaves the inbox without a copy in the Trash.
      await removeHeading(did, INBOX, id)
      return { said: `Kept as the note ${path}`, note: path }
    }
    case 'trash':
      await deleteHeading(did, INBOX, id)
      return { said: 'In the Trash (restore it from Outline)' }
  }
}

/** Schedules any task for a day ("YYYY-MM-DD", or with " HH:MM"), or unschedules it with null. */
export async function snooze(did: string, place: string, id: string, until: string | null): Promise<void> {
  if (until !== null && !WHEN.test(until)) throw new ChainError('Snooze needs a day')
  await updateNoteAt(did, pathOf(place), (note) => {
    const h = note.headings.find((x) => getProperty(x, 'CHAIN_ID') === id)
    if (!h) throw new ChainError('That task is no longer there', 404)
    snoozeHeading(h, until ?? '')
  })
}

/** A task somewhere in the GTD lists, as the review and someday views show it. */
export type ListedTask = { place: string; placeTitle: string; id: string; title: string; path: string[]; date: string | null; who: string | null }

type Walked = { place: string; placeTitle: string; node: ChainNode; path: string[] }

async function walkAll(did: string): Promise<Walked[]> {
  const out: Walked[] = []
  for (const d of DOMAINS) {
    const walk = (n: ChainNode, path: string[]) => {
      out.push({ place: d.key, placeTitle: d.title, node: n, path })
      n.children.forEach((c) => walk(c, [...path, n.title]))
    }
    // A list that does not exist yet starts from its template, as Next's own loader does.
    await seedChains(did, d.file, d.seed)
    buildTree(await readChains(did, d.file)).forEach((f) => walk(f, []))
  }
  return out
}

const listed = (w: Walked, date: string | null = null): ListedTask => ({
  place: w.place, placeTitle: w.placeTitle, id: w.node.id, title: w.node.title, path: w.path, date, who: w.node.waitingOn,
})

/** Everything marked SOMEDAY. */
export async function somedayList(did: string): Promise<ListedTask[]> {
  return (await walkAll(did)).filter((w) => w.node.someday).map((w) => listed(w))
}

export type Review = {
  lastReview: string | null
  inbox: number
  /** WAIT headings: who each is waiting for. */
  waiting: ListedTask[]
  /** Snoozed, coming back within two weeks. */
  comingBack: ListedTask[]
  someday: ListedTask[]
  /** Ticked off in the last seven days. */
  done: ListedTask[]
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * What the weekly review walks through. Projects with no next action come from
 * the Next view itself (its "needs a step" items), so they are not repeated here.
 */
export async function review(did: string, today: string): Promise<Review> {
  const [all, inbox] = await Promise.all([walkAll(did), inboxView(did, today)])
  const soon = addDays(today, 14)
  const weekAgo = addDays(today, -7)
  const closedDay = (n: ChainNode) => /(\d{4}-\d{2}-\d{2})/.exec(n.closed ?? '')?.[1] ?? null
  return {
    lastReview: inbox.lastReview,
    inbox: inbox.items.length,
    waiting: all.filter((w) => w.node.waiting && !w.node.done).map((w) => listed(w)),
    comingBack: [
      ...all.filter((w) => !w.node.done && snoozed(w.node, today) && w.node.snoozeDate! <= soon).map((w) => listed(w, w.node.snoozeDate)),
      ...inbox.snoozed.filter((i) => i.until! <= soon).map((i) => ({ place: 'inbox', placeTitle: 'Inbox', id: i.id, title: i.title, path: [], date: i.until, who: null })),
    ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    someday: all.filter((w) => w.node.someday).map((w) => listed(w)),
    done: all.filter((w) => w.node.done && (closedDay(w.node) ?? '') >= weekAgo).map((w) => listed(w, closedDay(w.node))),
  }
}

/** Notes the review as done today, in the inbox note's LAST_REVIEW. */
export async function markReviewed(did: string, today: string): Promise<void> {
  await updateNoteAt(did, INBOX, (note) => {
    const holder: Heading = { level: 0, title: '', properties: note.properties }
    setProperty(holder, 'LAST_REVIEW', today)
    note.properties = holder.properties
  })
}

/** Largest attachment accepted, in bytes. */
export const MAX_ATTACHMENT = 25 * 1024 * 1024

/** Attaches a file to a task: stored once by content ID, referenced from the heading. */
export async function attach(did: string, place: string, id: string, name: string, bytes: Uint8Array, mimeType: string): Promise<AttachmentInfo> {
  const blobs = notesHost().blobs
  if (!blobs) throw new ChainError('This janki has nowhere to keep files', 501)
  if (bytes.length === 0) throw new ChainError('That file is empty')
  if (bytes.length > MAX_ATTACHMENT) throw new ChainError('Files up to 25 MB')
  const cid = blobCid(bytes)
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : 'application/octet-stream'
  await blobs.put(did, cid, bytes, type)
  const a: Attachment = {
    name: name.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || 'file',
    blob: { $type: 'blob', ref: { $link: cid }, mimeType: type, size: bytes.length },
    addedAt: new Date().toISOString(),
  }
  await setAttachments(did, pathOf(place), id, (list) => [...list.filter((x) => x.blob.ref.$link !== cid), a])
  return { name: a.name, cid, mimeType: type, size: bytes.length, addedAt: a.addedAt }
}

/** Removes a file from a task. The blob stays: another task may hold the same file. */
export async function detach(did: string, place: string, id: string, cid: string): Promise<void> {
  if (!CID.test(cid)) throw new ChainError('Not a file id')
  await setAttachments(did, pathOf(place), id, (list) => list.filter((x) => x.blob.ref.$link !== cid))
}

/** A file's bytes, if it is the signed-in person's. */
export async function readBlob(did: string, cid: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!CID.test(cid)) return null
  return (await notesHost().blobs?.get(did, cid)) ?? null
}
