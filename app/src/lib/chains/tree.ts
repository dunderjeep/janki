/**
 * Chains: an org outline read as fronts, projects and steps.
 *
 * A top-level heading is a front. Everything under it is a chain: steps are
 * done top to bottom unless a heading says :ORDERED: nil. The next action of a
 * chain is the first unfinished step, followed down to its own first
 * unfinished step. Pure functions, so the page and the server agree on what
 * "next" means.
 *
 * GTD on top, in org terms:
 *   - a date keeps a task off "can do now" until it is due: SCHEDULED until its
 *     day, DEADLINE until its warning period starts (-3d, or org's 14 days).
 *     Until then it is in "coming up", and a step not yet due holds up an
 *     ordered chain behind it. Snoozing a task is setting its SCHEDULED;
 *   - SOMEDAY is someday/maybe: out of play until made a TODO again;
 *   - WAIT is waiting for someone (WAITING_ON says who): on the waiting list;
 *   - @tags are contexts, the tag `now` is the two-minute queue, and EFFORT
 *     (org's own, "0:15") and ENERGY ("low" or "high") say what a task takes.
 */

/** A file attached to a heading. */
export type AttachmentInfo = { name: string; cid: string; mimeType: string; size: number; addedAt: string }

/** One heading as quilt/chain-json reports it, in document order. */
export type FlatHeading = {
  id: string
  level: number
  title: string
  todo: string | null
  closed: string | null
  ordered: boolean
  purpose: string | null
  signal: string | null
  /** A page to work on this front in, e.g. its Google Sheet. */
  workspace: string | null
  /** CHAIN_IDs of related headings, in any file. */
  links: string[]
  /** CHAIN_IDs this waits for: it is not a next action until they are done. */
  waits: string[]
  scheduled: string | null
  deadline: string | null
  tags: string[]
  effort: string | null
  energy: string | null
  waitingOn: string | null
  attachments: AttachmentInfo[]
}

export type ChainNode = {
  id: string
  title: string
  todo: string | null
  done: boolean
  /** When it was ticked off, as org wrote it: "[2026-11-10 Tue 08:57]". */
  closed: string | null
  ordered: boolean
  purpose: string | null
  signal: string | null
  workspace: string | null
  links: string[]
  waits: string[]
  scheduled: string | null
  deadline: string | null
  parked: boolean
  /** Its own tags (contexts are the @ ones). */
  tags: string[]
  contexts: string[]
  /** In the two-minute queue. */
  now: boolean
  someday: boolean
  /** WAIT: waiting for someone, named in waitingOn. */
  waiting: boolean
  waitingOn: string | null
  /** The date an active SCHEDULED points at: until then a snooze hides it. */
  snoozeDate: string | null
  /** HH:MM, when the SCHEDULED has a time. */
  snoozeTime: string | null
  /** An active DEADLINE's date, and how many days ahead it starts to show. */
  deadlineDate: string | null
  deadlineWarn: number
  effort: string | null
  energy: string | null
  attachments: AttachmentInfo[]
  children: ChainNode[]
}

const DONE = new Set(['DONE', 'CANCELLED', 'CANCELED'])

/** The date in an active timestamp such as "<2026-11-20 Fri>", or null for none or an inactive one. */
const activeDate = (ts: string | null) => (ts && ts.startsWith('<') ? /(\d{4}-\d{2}-\d{2})/.exec(ts)?.[1] ?? null : null)

/**
 * Whether a SCHEDULED day (and time, if it has one) is still ahead of `today`,
 * which is a day, or a day and time ("YYYY-MM-DD HH:MM"). Snoozed until 18:00
 * today is ahead at 14:00 and over at 18:00.
 */
function ahead(date: string, time: string | null | undefined, today: string): boolean {
  const day = today.slice(0, 10)
  if (date !== day) return date > day
  const clock = today.slice(11, 16)
  // "8:00" and "08:00" are the same time; pad so they compare as text.
  return Boolean(time && clock && time.padStart(5, '0') > clock)
}

/** Snoozed: scheduled for later than `today` (a day, or a day and time). With no `today`, nothing is. */
export const snoozed = (n: Pick<ChainNode, 'snoozeDate'> & { snoozeTime?: string | null }, today: string) =>
  Boolean(today && n.snoozeDate && ahead(n.snoozeDate, n.snoozeTime, today))

type Due = Pick<ChainNode, 'snoozeDate' | 'snoozeTime' | 'deadlineDate' | 'deadlineWarn'>

const WARN_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 }

/** The dates in a heading's SCHEDULED and DEADLINE, as org writes them ("<2026-11-24 Tue +1m -3d>"). */
export function dueOf(scheduled: string | null, deadline: string | null): Due {
  const warn = deadline && /\s--?(\d+)([dwmy])>/.exec(deadline)
  return {
    snoozeDate: activeDate(scheduled),
    snoozeTime: (scheduled && activeDate(scheduled) && /\s(\d{1,2}:\d{2})/.exec(scheduled)?.[1]) || null,
    deadlineDate: activeDate(deadline),
    // org's own default warning period, org-deadline-warning-days.
    deadlineWarn: warn ? Number(warn[1]) * WARN_DAYS[warn[2]] : 14,
  }
}

const minusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

/**
 * Not due yet on `today`: scheduled for a later day, or (with no SCHEDULED) a
 * DEADLINE whose warning period has not started. A SCHEDULED on or before today
 * makes it due, whatever its deadline says. With no `today`, everything is due.
 */
export function notYet(n: Due, today: string): boolean {
  if (!today) return false
  if (n.snoozeDate) return ahead(n.snoozeDate, n.snoozeTime, today)
  if (n.deadlineDate) return minusDays(n.deadlineDate, n.deadlineWarn) > today.slice(0, 10)
  return false
}

/** A dated task that is not due yet: what "coming up" lists, under the calendar. */
export type Upcoming = {
  key: string
  /** chain: a heading (draggable to a day); task: a loose org TODO. */
  source: 'chain' | 'task'
  id: string | null
  domain: string
  domainTitle: string
  title: string
  path: string[]
  /** The day it is for: its SCHEDULED, or else its DEADLINE. */
  date: string
  time: string | null
  kind: 'scheduled' | 'deadline'
  /** The deadline as well, when it has one. */
  deadline: string | null
}

/** Every task under `fronts` that is not due yet, with the day it is for. A heading not due yet stands for its whole subtree. */
export function upcomingIn(domain: DomainInfo, fronts: ChainNode[], today: string): Upcoming[] {
  const out: Upcoming[] = []
  const walk = (n: ChainNode, path: string[]) => {
    if (n.done || n.someday) return
    if (notYet(n, today)) {
      out.push({
        key: `chain:${n.id}`, source: 'chain', id: n.id, domain: domain.key, domainTitle: domain.title, title: n.title, path,
        date: n.snoozeDate ?? n.deadlineDate!, time: n.snoozeDate ? n.snoozeTime : null,
        kind: n.snoozeDate ? 'scheduled' : 'deadline', deadline: n.deadlineDate,
      })
      return
    }
    n.children.forEach((c) => walk(c, [...path, n.title]))
  }
  fronts.forEach((f) => { if (!f.parked) walk(f, []) })
  return out
}

export function buildTree(flat: FlatHeading[]): ChainNode[] {
  const roots: ChainNode[] = []
  const stack: { level: number; node: ChainNode }[] = []
  for (const h of flat) {
    const node: ChainNode = {
      id: h.id,
      title: h.title,
      todo: h.todo,
      done: h.todo !== null && DONE.has(h.todo),
      closed: h.closed,
      ordered: h.ordered,
      purpose: h.purpose,
      signal: h.signal,
      workspace: h.workspace,
      links: h.links,
      waits: h.waits,
      scheduled: h.scheduled,
      deadline: h.deadline,
      parked: h.tags.includes('parked'),
      tags: h.tags,
      contexts: h.tags.filter((t) => t.startsWith('@')),
      now: h.tags.includes('now'),
      someday: h.todo === 'SOMEDAY',
      waiting: h.todo === 'WAIT',
      waitingOn: h.waitingOn ?? null,
      ...dueOf(h.scheduled, h.deadline),
      effort: h.effort ?? null,
      energy: h.energy ?? null,
      attachments: h.attachments ?? [],
      children: [],
    }
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ level: h.level, node })
  }
  return roots
}

export type Hit = {
  node: ChainNode
  /** From the front down to the step's parent. */
  path: ChainNode[]
  /** A project whose steps are all done but which is not itself done: it needs a next step, or ticking off. */
  needsStep: boolean
}

/**
 * The next actions under `node`. `skip` holds ids to treat as already done,
 * which is how "and after that?" is answered. `today` (YYYY-MM-DD) turns on
 * snoozes: without it, nothing is hidden.
 */
export function nextIn(node: ChainNode, path: ChainNode[] = [], skip: Set<string> = new Set(), today = ''): Hit[] {
  // Someday is out of play: neither a next action nor a step anything waits on.
  const isDone = (n: ChainNode) => n.done || n.someday || skip.has(n.id)
  if (isDone(node) || notYet(node, today)) return []
  const open = node.children.filter((c) => !isDone(c))
  const here = [...path, node]
  const self = (needsStep: boolean): Hit[] => (node.todo ? [{ node, path, needsStep }] : [])

  if (open.length === 0) return self(node.children.filter((c) => !c.someday).length > 0)
  if (node.ordered) {
    for (const child of open) {
      // A step not due yet holds the chain: what comes after it waits too.
      if (notYet(child, today)) return []
      const hits = nextIn(child, here, skip, today)
      if (hits.length) return hits
    }
    return self(true)
  }
  const awake = open.filter((c) => !notYet(c, today))
  if (awake.length === 0) return []
  const hits = awake.flatMap((child) => nextIn(child, here, skip, today))
  return hits.length ? hits : self(true)
}

/** What comes up in this front once `hit` is done, in words. */
export function thenAfter(front: ChainNode, hit: Hit, today = ''): string | null {
  const after = nextIn(front, [], new Set([hit.node.id]), today).find((h) => h.node.id !== hit.node.id)
  if (!after) return null
  return after.needsStep ? `decide what comes after "${after.node.title}"` : after.node.title
}

/** The latest CLOSED stamp anywhere under a front, as an ISO date. */
export function lastClosed(node: ChainNode): string | null {
  let best: string | null = null
  const visit = (n: ChainNode) => {
    const m = n.closed && /(\d{4}-\d{2}-\d{2})/.exec(n.closed)
    if (m && (!best || m[1] > best)) best = m[1]
    n.children.forEach(visit)
  }
  visit(node)
  return best
}

export function findNode(roots: ChainNode[], id: string): { node: ChainNode; parent: ChainNode | null; front: ChainNode } | null {
  const walk = (nodes: ChainNode[], parent: ChainNode | null, front: ChainNode | null): ReturnType<typeof findNode> => {
    for (const n of nodes) {
      const f = front ?? n
      if (n.id === id) return { node: n, parent, front: f }
      const found = walk(n.children, n, f)
      if (found) return found
    }
    return null
  }
  return walk(roots, null, null)
}

export function contains(node: ChainNode, id: string): boolean {
  return node.id === id || node.children.some((c) => contains(c, id))
}

/** A thing that can be done now, from a chain or from the loose org TODOs. */
export type NextAction = {
  key: string
  /**
   * Where it sits in your order. A chain keeps one place however many of its
   * steps you pop, so the step after takes the place of the one done.
   */
  slot: string
  /** chain: a step in an org outline. task: a loose org TODO. joblowski: a job waiting in the tracker. */
  source: 'chain' | 'task' | 'joblowski'
  domain: string
  domainTitle: string
  href: string
  title: string
  /** Front, project, …, parent. */
  path: string[]
  purpose: string | null
  then: string | null
  needsStep: boolean
  /** A front with nothing under it yet. */
  needsFirstStep: boolean
  /** The chain heading, for chain actions. */
  id: string | null
  frontId: string | null
  /** Where a loose org TODO lives, for ticking it off. */
  task: { file: string; pos: number } | null
  /** The tracked job behind a joblowski action, for parking or dismissing it from the list. */
  job: { id: string; status: string } | null
  deadline: string | null
  scheduled: string | null
  /** Related headings, and the ones it waits for (chain actions only). */
  links: string[]
  waits: string[]
  contexts: string[]
  /** In the two-minute queue. */
  now: boolean
  /** WAIT: waiting for someone, named in waitingOn. */
  waiting: boolean
  waitingOn: string | null
  effort: string | null
  energy: string | null
  attachments: AttachmentInfo[]
}

/** A heading with nothing set: the base for a made-up node, such as a whole domain's root. */
export const BLANK_NODE: Omit<ChainNode, 'id' | 'title' | 'children'> = {
  todo: null, done: false, closed: null, ordered: false, purpose: null, signal: null, workspace: null, links: [], waits: [],
  scheduled: null, deadline: null, parked: false, tags: [], contexts: [], now: false, someday: false, waiting: false,
  waitingOn: null, snoozeDate: null, snoozeTime: null, deadlineDate: null, deadlineWarn: 14, effort: null, energy: null, attachments: [],
}

/** The fields a non-chain action has none of. */
export const NO_GTD = { contexts: [], now: false, waiting: false, waitingOn: null, effort: null, energy: null, attachments: [] }

/** Minutes in an org EFFORT such as "0:15", "1:30" or "45", or null. */
export function effortMinutes(effort: string | null): number | null {
  if (!effort) return null
  const m = /^(?:(\d+):)?(\d+)$/.exec(effort.trim())
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null
}

/**
 * The domain a heading is in, for "open in Emacs" and links. `nagEmpty`: a
 * front with nothing left to do asks for its next step (money fronts do;
 * a group of chores in the task list doesn't).
 */
export type DomainInfo = { key: string; title: string; href: string; nagEmpty?: boolean }

/** Every heading in every domain, by CHAIN_ID: what a link shows and whether a wait is over. */
export type ChainIndex = Record<string, { title: string; done: boolean; domain: string; path: string[] }>

export function indexOf(domain: string, fronts: ChainNode[], into: ChainIndex = {}): ChainIndex {
  const walk = (n: ChainNode, path: string[]) => {
    into[n.id] = { title: n.title, done: n.done, domain, path }
    n.children.forEach((c) => walk(c, [...path, n.title]))
  }
  fronts.forEach((f) => walk(f, []))
  return into
}

/** What still holds an action up: the headings it waits for that aren't done. An id that no longer exists holds nothing up. */
export const waitingOn = (a: Pick<NextAction, 'waits'>, index: ChainIndex) => a.waits.filter((id) => index[id] && !index[id].done)

export function actionsFor(domain: DomainInfo, fronts: ChainNode[], today = ''): NextAction[] {
  const out: NextAction[] = []
  for (const front of fronts) {
    if (front.parked || front.done || front.someday || notYet(front, today)) continue
    const hits = nextIn(front, [], new Set(), today)
    const base = {
      source: 'chain' as const,
      domain: domain.key,
      domainTitle: domain.title,
      href: domain.href,
      purpose: front.purpose,
      frontId: front.id,
      task: null,
      job: null,
      deadline: null,
      scheduled: null,
      links: [] as string[],
      waits: [] as string[],
      ...NO_GTD,
    }
    if (hits.length === 0) {
      if (!domain.nagEmpty && !front.todo) continue
      out.push({
        ...base, key: `chain:${front.id}`, slot: `chain:${front.id}`, id: front.id, title: front.title, path: [],
        then: null, needsStep: true, needsFirstStep: true,
      })
      continue
    }
    for (const hit of hits) {
      out.push({
        ...base,
        key: `chain:${hit.node.id}`,
        // The chain is the highest heading whose steps run in order: the front
        // itself by default; each project, if the front's are in any order.
        slot: `chain:${(hit.path.find((p) => p.ordered) ?? hit.node).id}`,
        id: hit.node.id,
        title: hit.node.title,
        path: hit.path.map((p) => p.title),
        // "Then" only means something when the steps run in order; under an any-order heading it would just name a sibling.
        then: hit.path.length && !hit.path[hit.path.length - 1].ordered ? null : thenAfter(front, hit, today),
        needsStep: hit.needsStep,
        needsFirstStep: false,
        deadline: hit.node.deadline,
        scheduled: hit.node.scheduled,
        links: hit.node.links,
        waits: hit.node.waits,
        contexts: hit.node.contexts,
        now: hit.node.now,
        waiting: hit.node.waiting,
        waitingOn: hit.node.waitingOn,
        effort: hit.node.effort,
        energy: hit.node.energy,
        attachments: hit.node.attachments,
      })
    }
  }
  return out
}

