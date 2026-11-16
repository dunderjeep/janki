import { basename } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { agendaFiles, setAgendaTodo, tasksList } from '@/lib/orgAgenda'
import { didForUser } from '@/lib/notesHost'
import { DOMAINS, ORG_TASKS, type Domain } from './domains'
import { ChainError } from './errors'
import { now } from './route'
import { addHeading, deleteHeading, moveHeading, readChains, seedChains, setField, type Field, type Place } from './notesChains'
import { withJoblowski } from './joblowskiActions'
import {
  actionsFor, buildTree, contains, dueOf, findNode, indexOf, NO_GTD, notYet, upcomingIn, waitingOn, type Upcoming,
  type ChainIndex, type ChainNode, type DomainInfo, type NextAction,
} from './tree'

export { ChainError }

/** The DID whose notes hold this person's chains. */
async function didOf(uid: string): Promise<string> {
  const did = await didForUser(uid)
  if (!did) throw new ChainError('Link a Bluesky account to use your notes', 403)
  return did
}

export async function loadFronts(did: string, domain: Domain): Promise<ChainNode[]> {
  await seedChains(did, domain.file, domain.seed)
  return buildTree(await readChains(did, domain.file))
}

/** Puts actions in the order you dragged them into; ones never placed keep their outline order, after the rest. */
export async function inFocusOrder(uid: string, actions: NextAction[]): Promise<NextAction[]> {
  if (actions.length === 0) return actions
  const { rows } = await db.execute<{ key: string; rank: number }>(sql`
    select key, rank from dough.focus where owner_uid = ${uid}`)
  const rank = new Map(rows.map((r) => [r.key, Number(r.rank)]))
  return actions
    .map((a, i) => ({ a, i, r: rank.get(a.slot) ?? Number.POSITIVE_INFINITY }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a)
}

/**
 * Saves a new order for some of the actions' slots. They take the rank slots they
 * held between them, so reordering money's list never shuffles where money
 * sits among the other domains in the overall list.
 */
export async function saveOrder(uid: string, keys: string[]): Promise<void> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 500 || keys.some((k) => typeof k !== 'string' || k.length > 600)) {
    throw new ChainError('keys must be a list of action keys')
  }
  keys = [...new Set(keys)]
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ key: string; rank: number }>(sql`
      select key, rank from dough.focus where owner_uid = ${uid} for update`)
    const held = new Map(rows.map((r) => [r.key, Number(r.rank)]))
    let next = rows.reduce((m, r) => Math.max(m, Number(r.rank)), -1) + 1
    const slots = keys.map((k) => held.get(k) ?? next++).sort((a, b) => a - b)
    for (let i = 0; i < keys.length; i++) {
      await tx.execute(sql`
        insert into dough.focus (owner_uid, key, rank) values (${uid}, ${keys[i]}, ${slots[i]})
        on conflict (owner_uid, key) do update set rank = excluded.rank`)
    }
  })
}

const infoOf = (d: Domain): DomainInfo => ({ key: d.key, title: d.title, href: d.href, nagEmpty: d.nagEmpty })

type Loaded = { domain: Domain; fronts: ChainNode[] }

/** Every domain's outline. A domain that can't be read is reported, not fatal. */
async function loadAll(did: string, problems: { source: string; error: string }[]): Promise<Loaded[]> {
  const out: Loaded[] = []
  for (const domain of DOMAINS) {
    try {
      out.push({ domain, fronts: await loadFronts(did, domain) })
    } catch (err) {
      problems.push({ source: domain.title, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
}

/**
 * An action waiting on something not done yet: other headings (`on`, by
 * CHAIN_ID), or a person or thing (`who`, from a WAIT heading's WAITING_ON).
 */
export type Waiting = { action: NextAction; on: string[]; who: string | null }

/** Splits off the actions that wait for headings not done yet. */
function holdBack(actions: NextAction[], index: ChainIndex): { ready: NextAction[]; waiting: Waiting[] } {
  const ready: NextAction[] = []
  const waiting: Waiting[] = []
  for (const a of actions) {
    const on = waitingOn(a, index)
    if (on.length || a.waiting) waiting.push({ action: a, on, who: a.waiting ? (a.waitingOn ?? 'someone') : null })
    else ready.push(a)
  }
  return { ready, waiting }
}

export type DomainView = {
  domain: DomainInfo
  fronts: ChainNode[]
  next: NextAction[]
  waiting: Waiting[]
  /** Dated tasks not due yet, soonest first. */
  upcoming: Upcoming[]
  /** Every heading in every domain, for showing links. */
  index: ChainIndex
}

const byDate = (a: Upcoming, b: Upcoming) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99')

export async function domainView(uid: string, domain: Domain): Promise<DomainView> {
  const did = await didOf(uid)
  const all = await loadAll(did, [])
  const fronts = all.find((l) => l.domain.key === domain.key)?.fronts ?? (await loadFronts(did, domain))
  const index: ChainIndex = {}
  for (const l of all) indexOf(l.domain.key, l.fronts, index)
  indexOf(domain.key, fronts, index)
  const info = infoOf(domain)
  const { ready, waiting } = holdBack(await withJoblowski(uid, info, fronts, actionsFor(info, fronts, now())), index)
  const upcoming = upcomingIn(info, fronts, now()).sort(byDate)
  return { domain: info, fronts, next: await inFocusOrder(uid, ready), waiting, upcoming, index }
}

export type OverallView = {
  next: NextAction[]
  waiting: Waiting[]
  /** Dated tasks not due yet, soonest first: the list under the calendar. */
  upcoming: Upcoming[]
  /** Each domain's outline, to edit on the page. */
  outline: { domain: DomainInfo; fronts: ChainNode[] }[]
  index: ChainIndex
  problems: { source: string; error: string }[]
}

export async function overallView(uid: string): Promise<OverallView> {
  const problems: OverallView['problems'] = []
  const actions: NextAction[] = []
  const upcoming: Upcoming[] = []
  const did = await didOf(uid)
  const all = await loadAll(did, problems)
  const index: ChainIndex = {}
  for (const { domain, fronts } of all) {
    indexOf(domain.key, fronts, index)
    try {
      const info = infoOf(domain)
      actions.push(...(await withJoblowski(uid, info, fronts, actionsFor(info, fronts, now()))))
      upcoming.push(...upcomingIn(info, fronts, now()))
    } catch (err) {
      problems.push({ source: domain.title, error: err instanceof Error ? err.message : String(err) })
    }
  }
  try {
    const domainFiles = new Set(DOMAINS.map((d) => d.file))
    for (const t of await tasksList(did)) {
      if (domainFiles.has(t.file)) continue
      const due = dueOf(t.scheduled, t.deadline)
      if (notYet(due, now())) {
        upcoming.push({
          key: `task:${t.file}::${t.heading}`, source: 'task', id: null, domain: ORG_TASKS.key, domainTitle: ORG_TASKS.title,
          title: t.heading, path: [basename(t.file, '.org')], date: due.snoozeDate ?? due.deadlineDate!,
          time: due.snoozeDate ? due.snoozeTime : null, kind: due.snoozeDate ? 'scheduled' : 'deadline', deadline: due.deadlineDate,
        })
        continue
      }
      actions.push({
        key: `task:${t.file}::${t.heading}`,
        slot: `task:${t.file}::${t.heading}`,
        source: 'task',
        domain: ORG_TASKS.key,
        domainTitle: ORG_TASKS.title,
        href: ORG_TASKS.href,
        title: t.heading,
        path: [basename(t.file, '.org')],
        purpose: null,
        then: null,
        needsStep: false,
        needsFirstStep: false,
        id: null,
        frontId: null,
        task: { file: t.file, pos: t.pos },
        ...NO_GTD,
        job: null,
        deadline: t.deadline,
        scheduled: t.scheduled,
        links: [],
        waits: [],
      })
    }
  } catch (err) {
    problems.push({ source: ORG_TASKS.title, error: err instanceof Error ? err.message : String(err) })
  }

  // Forget the places of actions that are finished, but only when every
  // source answered: a missing domain is not a domain whose actions are done.
  if (problems.length === 0) {
    const live = [...new Set(actions.map((a) => a.slot))]
    // drizzle expands an array into ($1, $2, …), which is empty-list invalid SQL.
    await db.execute(live.length
      ? sql`delete from dough.focus where owner_uid = ${uid} and key not in ${live}`
      : sql`delete from dough.focus where owner_uid = ${uid}`)
  }
  const { ready, waiting } = holdBack(actions, index)
  return {
    next: await inFocusOrder(uid, ready),
    waiting,
    upcoming: upcoming.sort(byDate),
    outline: all.map(({ domain, fronts }) => ({ domain: infoOf(domain), fronts })),
    index,
    problems,
  }
}

/** Ticks off a loose TODO in one of the agenda notes. */
export async function completeTask(uid: string, file: string, pos: number): Promise<void> {
  if (typeof file !== 'string' || !Number.isInteger(pos) || pos < 1) throw new ChainError('file and pos are required')
  if (!agendaFiles().includes(file)) throw new ChainError('That is not one of the agenda notes', 403)
  await setAgendaTodo(await didOf(uid), file, pos, 'DONE')
}

const ID = /^[0-9a-f-]{8,64}$/i
const id = (v: unknown, what = 'id'): string => {
  if (typeof v !== 'string' || !ID.test(v)) throw new ChainError(`${what} is missing or malformed`)
  return v
}
const optionalId = (v: unknown, what: string) => (v === null || v === undefined ? null : id(v, what))
const title = (v: unknown): string => {
  const t = typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim() : ''
  if (!t) throw new ChainError('Give it a name')
  if (t.length > 300) throw new ChainError('Keep it under 300 characters')
  return t
}

const FIELDS: Record<Field, (v: string) => boolean> = {
  todo: (v) => ['TODO', 'DONE', 'WAIT', 'SOMEDAY', 'CANCELLED', ''].includes(v),
  now: (v) => v === 't' || v === 'nil',
  area: (v) => v === 't' || v === 'nil',
  // A day (and time) to schedule it for, or "" to unschedule.
  snooze: (v) => v === '' || /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v),
  // Space-separated @contexts.
  contexts: (v) => v === '' || (v.length <= 300 && v.split(' ').every((c) => /^@[\p{L}\p{N}_]{1,40}$/u.test(c))),
  // org's EFFORT: minutes or H:MM.
  EFFORT: (v) => v === '' || /^(\d{1,2}:\d{2}|\d{1,4})$/.test(v),
  ENERGY: (v) => ['', 'low', 'high'].includes(v),
  WAITING_ON: (v) => v.length <= 120,
  title: (v) => v.trim().length > 0,
  parked: (v) => v === 't' || v === 'nil',
  PURPOSE: (v) => v.length <= 300,
  SIGNAL: (v) => ['', 'joblowski', 'bokki', 'tally'].includes(v),
  ORDERED: (v) => v === 't' || v === 'nil',
  WORKSPACE: (v) => v === '' || isHttps(v),
  LINKS: (v) => idList(v),
  WAITS: (v) => idList(v),
}

/** "" or up to 50 CHAIN_IDs separated by spaces. */
const idList = (v: string) => v === '' || (v.split(' ').length <= 50 && v.split(' ').every((x) => ID.test(x)))

/** Workspaces are shown in a frame; https only, like the bank links. */
function isHttps(v: string): boolean {
  try {
    return new URL(v).protocol === 'https:' && v.length <= 2000
  } catch {
    return false
  }
}

/** One edit to a domain's outline. */
export async function applyOp(uid: string, domain: Domain, body: Record<string, unknown>): Promise<string | null> {
  const did = await didOf(uid)
  {
    switch (body.op) {
      case 'add': {
        const place = body.place as Place
        if (!['after', 'first', 'last'].includes(place)) throw new ChainError('place must be after, first or last')
        const anchor = optionalId(body.anchor, 'anchor')
        if (place === 'after' && !anchor) throw new ChainError('after needs an anchor')
        return await addHeading(did, domain.file, anchor, place, title(body.title), body.todo === false ? '' : 'TODO')
      }
      case 'set': {
        const field = body.field as Field
        const value = typeof body.value === 'string' ? body.value.replace(/[\r\n]+/g, ' ').trim() : ''
        if (!(field in FIELDS) || !FIELDS[field](value)) throw new ChainError('That change is not allowed')
        await setField(did, domain.file, id(body.id), field, field === 'title' ? title(value) : value)
        return null
      }
      case 'move': {
        const moving = id(body.id)
        const parent = optionalId(body.parent, 'parent')
        const index = Number(body.index)
        if (!Number.isInteger(index) || index < 0) throw new ChainError('index must be a whole number')
        if (parent) {
          const fronts = buildTree(await readChains(did, domain.file))
          const found = findNode(fronts, moving)
          if (found && contains(found.node, parent)) throw new ChainError('A step cannot go inside itself')
        }
        await moveHeading(did, domain.file, moving, parent, index)
        return null
      }
      case 'delete':
        await deleteHeading(did, domain.file, id(body.id))
        return null
      default:
        throw new ChainError('Unknown op')
    }
  }
}
