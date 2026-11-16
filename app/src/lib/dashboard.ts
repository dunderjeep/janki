/**
 * What the home screen shows on an app's tile besides its name: the item you
 * were last on (a caption, or a picture), and a count of what is waiting for
 * you (a badge). Only where it means something: Mail and Next count what is
 * to process, Joblowski new job alert hits, Dough the fronts gone quiet;
 * Focus, SRS and Porcupin just show where you were (SRS's backlog is a
 * someday matter, so it gets no count).
 *
 * Each app's look-up stands alone and gives up quietly, so a slow or broken
 * app never keeps the home screen from loading.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db, srsDecks, srsSessions } from '@/db'
import { porcupinPins } from '@/db/schema/porcupin'
import { imageSrc } from '@/lib/porcupin/types'
import { didForUser } from '@/lib/notesHost'

export type TileExtra = { caption?: string; badge?: number; image?: string }

/** At most `ms` for one app; on a timeout or an error, nothing for it. */
async function within<T>(ms: number, work: () => Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([work(), new Promise<null>((r) => { timer = setTimeout(() => r(null), ms) })])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function mail(uid: string): Promise<TileExtra> {
  await import('@/lib/mailHost')
  const { listMessages, toProcess } = await import('mail/server')
  const [waiting, [latest]] = await Promise.all([toProcess(uid), listMessages(uid, { todo: true, limit: 1 })])
  return {
    badge: waiting || undefined,
    caption: latest ? `${latest.fromName || latest.fromAddr}: ${latest.subject || '(no subject)'}` : waiting === 0 ? 'Inbox zero' : undefined,
  }
}

async function next(uid: string): Promise<TileExtra> {
  const did = await didForUser(uid)
  if (!did) return {}
  const [{ overallView }, { inboxView }, { now }] = await Promise.all([import('@/lib/chains/store'), import('@/lib/chains/gtd'), import('@/lib/chains/route')])
  const [view, inbox] = await Promise.all([overallView(uid), inboxView(did, now())])
  // The top card on Next's Do page: the first thing that isn't a two-minute job.
  const top = view.next.find((a) => !a.now)
  const waiting = inbox.items.filter((i) => !i.until).length
  return {
    badge: waiting || undefined,
    caption: top ? (top.needsStep ? `What's next for ${top.title}?` : top.title) : undefined,
  }
}

async function focus(uid: string): Promise<TileExtra> {
  const did = await didForUser(uid)
  if (!did) return {}
  // The note last changed, leaving out the lists Next keeps and the dailies (Daily has its own tile).
  const { rows } = await db.execute<{ title: string }>(sql`
    select value->>'title' as title from notes.records
     where did = ${did} and coalesce(value->>'path', '') not in ('inbox.org', 'trash.org', 'tasks.org', 'dough.org')
       and coalesce(value->>'path', '') not like 'daily/%'
     order by coalesce(value->>'updatedAt', value->>'createdAt') desc nulls last limit 1`)
  return rows[0]?.title ? { caption: rows[0].title } : {}
}

async function srs(uid: string): Promise<TileExtra> {
  const [last] = await db.select({ name: srsDecks.name }).from(srsSessions)
    .leftJoin(srsDecks, eq(srsDecks.id, srsSessions.deckId))
    .where(eq(srsSessions.ownerUid, uid)).orderBy(desc(srsSessions.startedAt)).limit(1)
  return last ? { caption: last.name ?? 'All due cards' } : {}
}

/** Days without a move before a front counts as gone quiet, as Dough marks it. */
const STALL_DAYS = 14

async function dough(uid: string): Promise<TileExtra> {
  const { doughView } = await import('@/lib/dough/view')
  const v = await doughView(uid)
  const cutoff = Date.now() - STALL_DAYS * 86_400_000
  const quiet = v.fronts.filter((f) => !f.parked && !f.done && !f.someday).filter((f) => {
    const moved = v.signals.fronts[f.id]?.lastMoved
    return !moved || new Date(`${moved}T12:00:00`).getTime() < cutoff
  })
  const top = v.next[0]
  return {
    badge: quiet.length || undefined,
    caption: top ? (top.needsStep ? `What's next for ${top.title}?` : top.title) : undefined,
  }
}

async function joblowski(uid: string): Promise<TileExtra> {
  await import('@/lib/joblowskiHost')
  const { newHits } = await import('joblowski/server')
  const hits = await newHits(uid)
  const top = hits[0]
  return {
    badge: hits.length || undefined,
    caption: top ? [top.title, top.company].filter(Boolean).join(' · ') : undefined,
  }
}

async function porcupin(uid: string): Promise<TileExtra> {
  const [pin] = await db.select({ id: porcupinPins.id, title: porcupinPins.title, filename: porcupinPins.filename })
    .from(porcupinPins).where(eq(porcupinPins.ownerUid, uid)).orderBy(desc(porcupinPins.createdAt)).limit(1)
  return pin ? { image: imageSrc(pin.id, 'thumb'), caption: pin.title || pin.filename } : {}
}

const LOOKUPS: Record<string, (uid: string) => Promise<TileExtra>> = {
  '/mail': mail, '/next': next, '/quilt/org': focus, '/srs': srs, '/porcupin': porcupin, '/dough': dough, '/joblowski': joblowski,
}

/** Every app's extra, by its href, looked up side by side; an app that takes over 5 s is left out. */
export async function tileExtras(uid: string, only?: string[]): Promise<Record<string, TileExtra>> {
  const entries = await Promise.all(Object.entries(LOOKUPS).filter(([href]) => !only || only.includes(href)).map(async ([href, look]) => [href, await within(5000, () => look(uid))] as const))
  return Object.fromEntries(entries.filter(([, v]) => v).map(([k, v]) => [k, v!]))
}
