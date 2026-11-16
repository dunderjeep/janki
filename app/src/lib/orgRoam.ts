/**
 * Quilt's view of the notes: the graph of linkable notes and headings, and
 * which horizon ring each one sits in.
 *
 * This used to read org-roam's SQLite database, which Emacs kept current. It
 * now reads the notes in Postgres (the notes/ package), so it needs no Emacs,
 * no subprocess and no files. What janki adds on top is still the one thing
 * org-roam-ui structurally cannot: a position you placed by hand that is still
 * there tomorrow (see quiltPositions).
 */
import { graph, linkedIdsIn, notesUnder } from 'notes/server'
import '@/lib/notesHost'
import { parseDaily, routineKeys, ROUTINE_WINDOW, todayString } from './orgDailies'

/** Where the .org files lived. Still read by Scatterbrain and the chains until they move to notes too. */
export const ORG_DIR = process.env.ORG_DIR ?? `${process.env.HOME ?? ''}/org`

export type OrgNode = {
  id: string
  title: string
  /** The note's path, such as 'daily/2026-11-15.org'. */
  file: string
  /** 0 for a file-level note; >0 for a heading inside one. */
  level: number
  tags: string[]
  todo: string | null
  scheduled: string | null
  deadline: string | null
}

export type OrgLink = {
  source: string
  dest: string
  /** The description-list term on the link's line: `- supports :: [[id:…]]`. */
  label: string | null
}

/**
 * Every linkable note and heading, and one edge per linked pair. Links that
 * point at a missing ID (about a third of id: links do) are left out, so they
 * never invent ghost nodes.
 */
export async function readOrgGraph(did: string): Promise<{ nodes: OrgNode[]; links: OrgLink[] }> {
  const g = await graph(did)
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id, title: n.title, file: n.path ?? '', level: n.level, tags: n.tags,
      todo: n.todo, scheduled: n.scheduled, deadline: n.deadline,
    })),
    links: g.edges.map((e) => ({ source: e.source, dest: e.target, label: e.label })),
  }
}

export async function readOrgNodes(did: string): Promise<OrgNode[]> {
  return (await readOrgGraph(did)).nodes
}

// ── Horizon rings ─────────────────────────────────────────────────────────────
//
// The concentric layout is not hand-placed. Which ring a note sits in is a
// function of the time horizon that points at it, and the horizons are notes:
// the recent dailies, this_week, this_month, this_year, goals. Today at the
// centre, goals at the rim, everything with no stated horizon in the periphery.

export type Horizon = { ring: number; name: string; file: string }

/** Innermost first. Ring 5 is the periphery and has no note. Paths are relative to the notes' root. */
export function horizons(now = new Date()): Horizon[] {
  return [
    // Ring 0's real membership comes from RECENCY_DAYS of dailies, not this one
    // note; see assignRings. The path is kept for the sidebar to name.
    { ring: 0, name: 'today', file: `daily/${todayString(now)}.org` },
    { ring: 1, name: 'this week', file: 'this_week.org' },
    { ring: 2, name: 'this month', file: 'this_month.org' },
    { ring: 3, name: 'this year', file: 'this_year.org' },
    { ring: 4, name: 'goals', file: 'goals.org' },
  ]
}

export const PERIPHERY_RING = 5

/**
 * How many days of dailies feed the centre ring.
 *
 * Not one. Six of the last fourteen days had no new link at all, so a strict
 * midnight boundary leaves the bullseye empty on nearly half of mornings. And
 * the daily is written *through* the morning, so at 6am today's is a template
 * with nothing in it yet. Three days of carry matches how unfinished things
 * actually persist.
 */
export const RECENCY_DAYS = 3

export type RingResult = {
  rings: Map<string, number>
  /** Days since the daily that put a note in ring 0. Drives the fade. */
  ages: Map<string, number>
  /** Notes that are standing routine: shown in the readout, not the rings. */
  routine: Set<string>
  horizons: Horizon[]
}

const DAILY = /^daily\/(\d{4}-\d{2}-\d{2})\.org$/

/**
 * Ring per node id, plus which horizon each ring came from.
 *
 * Innermost wins: something pulled into today's daily stops being a this-month
 * item, which is what makes dragging a note to the centre a meaningful act
 * rather than just a position change.
 */
export async function assignRings(did: string, nodes: OrgNode[], now = new Date()): Promise<RingResult> {
  const hs = horizons(now)
  const known = new Set(nodes.map((n) => n.id))
  const rings = new Map<string, number>()
  const ages = new Map<string, number>()

  // Rings 1..4 come straight from what their horizon note links to.
  for (const h of hs) {
    if (h.ring === 0) continue
    for (const id of await linkedIdsIn(did, h.file)) {
      if (!known.has(id)) continue
      const current = rings.get(id)
      if (current === undefined || h.ring < current) rings.set(id, h.ring)
    }
  }

  // The last fortnight of dailies: for the routine, and the newest for ring 0.
  // Read a little extra: anything else kept under daily/ must not crowd out a day.
  const dailies = (await notesUnder(did, 'daily/', ROUTINE_WINDOW + 30))
    .map((n) => ({ n, m: DAILY.exec(n.path) }))
    .filter((x): x is { n: typeof x.n; m: RegExpExecArray } => Boolean(x.m))
    .slice(0, ROUTINE_WINDOW + 1)
    .map((x) => parseDaily(x.m[1], x.n.path, x.n.text))

  // Ring 0 is what makes the last few days different: the recent dailies, minus
  // the standing routine, which lives in its own readout rather than on the map.
  const keys = routineKeys(dailies)
  const routine = new Set<string>()
  for (const d of dailies) for (const i of d.items) if (i.orgId && keys.has(i.key)) routine.add(i.orgId)

  // The horizon notes themselves are linked from every daily as navigation.
  // Pulling "This Month" into today's ring says nothing except that the template
  // links to it, so they keep the ring they name.
  const anchors = new Set(nodes.filter((n) => hs.some((h) => h.ring > 0 && h.file === n.file)).map((n) => n.id))

  for (let age = 0; age < RECENCY_DAYS; age++) {
    const d = new Date(now)
    d.setDate(d.getDate() - age)
    for (const id of await linkedIdsIn(did, `daily/${todayString(d)}.org`)) {
      if (!known.has(id) || routine.has(id) || anchors.has(id)) continue
      rings.set(id, 0)
      const seen = ages.get(id)
      if (seen === undefined || age < seen) ages.set(id, age)
    }
  }

  // A horizon note belongs to the ring it names. goals.org does not link to
  // itself, so without this it falls through to the periphery: the note called
  // "goals" ending up as far from the centre as it is possible to be.
  for (const h of hs) {
    if (h.ring === 0) continue
    for (const n of nodes) if (n.file === h.file) rings.set(n.id, h.ring)
  }

  for (const n of nodes) if (!rings.has(n.id)) rings.set(n.id, PERIPHERY_RING)
  return { rings, ages, routine, horizons: hs }
}
