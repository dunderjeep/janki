import type { NextRequest } from 'next/server'
import { asUser, now, today } from '@/lib/chains/route'
import { ChainError } from '@/lib/chains/errors'
import { didForUser, syncNotes } from '@/lib/notesHost'
import {
  attach, capture, detach, inboxView, markReviewed, MAX_ATTACHMENT, processItem, readBlob, review, snooze, somedayList,
  INBOX, pathOf, type Decision,
} from '@/lib/chains/gtd'
import { purgeHeading, restoreHeading, setField, trashList } from '@/lib/chains/notesChains'
import { followProjectRename, newDoc, projectDocs, taskDocs, unlistTaskDoc } from '@/lib/chains/docs'
import { DOMAINS } from '@/lib/chains/domains'
import { AGENDA_NOTES } from '@/lib/orgAgenda'
import { searchHeadings } from 'notes/server'
import { searchDoughExtras } from '@/lib/dough/search'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path: string[] }> }

async function didOf(uid: string): Promise<string> {
  const did = await didForUser(uid)
  if (!did) throw new ChainError('Link a Bluesky account to use your notes', 403)
  await syncNotes(did)
  return did
}

const text = (v: unknown, max: number, what: string): string => {
  const t = typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim() : ''
  if (!t) throw new ChainError(`${what} is missing`)
  if (t.length > max) throw new ChainError(`${what} is too long`)
  return t
}

/**
 * GET  inbox | someday | review | trash | blob/<cid>
 *      search?q=…&done=0             tasks by name or text, across Next's notes
 *      docs?place=&project=… | docs?place=&task=…   a project's or a task's docs
 * POST docs {place, project, title, task?}          a new doc in the project (listed on the task too)
 * DELETE docs {place, task, doc}                     take a doc off a task's list
 * POST inbox {title, detail?}       capture
 *      process {id, decision}       process an inbox item
 *      snooze {place, id, until}    snooze any task (until: YYYY-MM-DD, or null to wake)
 *      review                       mark the weekly review done
 *      restore {id}                 put a deleted heading back
 *      rename {place, id, title}    rename any task, project or inbox item
 * DELETE trash {id}                 delete it from the Trash for good
 *      attach (multipart: place, id, file)
 * DELETE attach {place, id, cid}
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const [what, arg] = (await params).path
  return asUser(async (uid) => {
    const did = await didOf(uid)
    if (what === 'inbox') return inboxView(did, now())
    if (what === 'someday') return { items: await somedayList(did) }
    if (what === 'review') return review(did, today())
    if (what === 'trash') return { items: await trashList(did) }
    // search?q=…&done=0: tasks whose name or text holds the words, across Next's notes.
    if (what === 'search') {
      const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 200)
      // Agenda notes first, so a note that is also a list (tasks.org) or the inbox keeps that name and place.
      const places = new Map<string, { place: string | null; title: string }>([
        ...AGENDA_NOTES.map((f) => [f, { place: null, title: f.replace(/\.org$/, '') }] as const),
        ...DOMAINS.map((d) => [d.file, { place: d.key, title: d.title }] as const),
        [INBOX, { place: 'inbox', title: 'Inbox' }],
      ])
      // ?place=money keeps to one domain (Dough's search), and adds that domain's own things.
      const only = DOMAINS.find((d) => d.key === req.nextUrl.searchParams.get('place'))
      const paths = only ? [only.file] : [...places.keys()]
      const hits = await searchHeadings(did, q, paths, { includeDone: req.nextUrl.searchParams.get('done') !== '0' })
      return {
        hits: hits.map((h) => ({ ...h, place: places.get(h.file)?.place ?? null, placeTitle: places.get(h.file)?.title ?? h.file })),
        ...(only?.key === 'money' ? { extras: await searchDoughExtras(uid, did, q) } : {}),
      }
    }
    // docs?place=&project=<front id> or docs?place=&task=<task id>
    if (what === 'docs') {
      const q = req.nextUrl.searchParams
      const place = text(q.get('place'), 40, 'place')
      const task = q.get('task')
      if (task) return { docs: await taskDocs(uid, did, place, text(task, 64, 'task')) }
      return projectDocs(uid, did, place, text(q.get('project'), 64, 'project'))
    }
    if (what === 'blob' && arg) {
      const blob = await readBlob(did, arg)
      if (!blob) throw new ChainError('No such file', 404)
      const name = (req.nextUrl.searchParams.get('name') ?? arg).replace(/[^\w. -]/g, '_')
      // Images, PDFs and text open in the browser; anything else downloads.
      const inline = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain)$/.test(blob.mimeType)
      return new Response(Buffer.from(blob.bytes), {
        headers: {
          'content-type': blob.mimeType,
          'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
          'x-content-type-options': 'nosniff',
          // A file's id is its content, so it never changes.
          'cache-control': 'private, max-age=31536000, immutable',
        },
      })
    }
    throw new ChainError('Not found', 404)
  })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const [what] = (await params).path
  return asUser(async (uid) => {
    const did = await didOf(uid)
    if (what === 'attach') {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) throw new ChainError('Choose a file')
      if (file.size > MAX_ATTACHMENT) throw new ChainError('Files up to 25 MB')
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { attachment: await attach(did, text(form.get('place'), 40, 'place'), text(form.get('id'), 64, 'id'), file.name, bytes, file.type) }
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (what === 'inbox') {
      const id = await capture(did, text(body.title, 300, 'What it is'), typeof body.detail === 'string' ? body.detail.slice(0, 5000) : undefined)
      return { id, ...(await inboxView(did, now())) }
    }
    if (what === 'process') {
      const d = body.decision as Decision
      if (!d || typeof d !== 'object' || typeof d.kind !== 'string') throw new ChainError('decision is missing')
      return processItem(did, text(body.id, 64, 'id'), d)
    }
    if (what === 'snooze') {
      const until = body.until === null ? null : text(body.until, 16, 'until')
      await snooze(did, text(body.place, 40, 'place'), text(body.id, 64, 'id'), until)
      return { ok: true }
    }
    if (what === 'review') {
      await markReviewed(did, today())
      return { ok: true }
    }
    if (what === 'restore') return { to: await restoreHeading(did, text(body.id, 64, 'id')) }
    if (what === 'rename') {
      const title = text(body.title, 300, 'A name')
      const place = text(body.place, 40, 'place')
      const id = text(body.id, 64, 'id')
      await setField(did, pathOf(place), id, 'title', title)
      // A project with docs keeps its Scatterbrain work under the same name.
      if (place !== 'inbox') await followProjectRename(uid, did, place, id, title)
      return { title }
    }
    if (what === 'docs') {
      return newDoc(uid, did, text(body.place, 40, 'place'), text(body.project, 64, 'project'), text(body.title, 200, 'A name'),
        typeof body.task === 'string' ? text(body.task, 64, 'task') : undefined)
    }
    throw new ChainError('Not found', 404)
  })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const [what] = (await params).path
  return asUser(async (uid) => {
    const did = await didOf(uid)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (what === 'trash') {
      await purgeHeading(did, text(body.id, 64, 'id'))
      return { ok: true }
    }
    if (what === 'docs') {
      await unlistTaskDoc(did, text(body.place, 40, 'place'), text(body.task, 64, 'task'), text(body.doc, 64, 'doc'))
      return { ok: true }
    }
    if (what !== 'attach') throw new ChainError('Not found', 404)
    await detach(did, text(body.place, 40, 'place'), text(body.id, 64, 'id'), text(body.cid, 80, 'cid'))
    return { ok: true }
  })
}
