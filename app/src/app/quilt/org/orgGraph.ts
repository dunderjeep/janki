import type { Node as RFNode, Edge as RFEdge } from 'reactflow'

export type OrgGraphNode = {
  id: string
  title: string
  file: string
  level: number
  tags: string[]
  todo: string | null
  scheduled: string | null
  deadline: string | null
  ring: number
  /** Days since the daily that put this in ring 0; null outside ring 0. */
  age: number | null
  /** Part of the standing routine — lives in the readout, not on a ring. */
  routine: boolean
}

export type OrgGraphLink = {
  source: string
  dest: string
  /** What the link means — `- supports :: [[id:…]]` in the source note. */
  label: string | null
}
export type OrgPosition = {
  orgId: string
  x: number
  y: number
  pinned: boolean
  angle: number | null
  bandT: number | null
  placedRing: number | null
}
export type OrgHorizon = { ring: number; name: string; file: string }

export const PERIPHERY_RING = 5

/**
 * The rings, outward from now.
 *
 * Colour carries horizon, not category: the question the canvas answers is
 * "how close is this to what I am doing today", so that is what the eye should
 * get first. Warm at the centre where attention is, cool at the rim.
 */
export const RING_STYLE: Record<number, { label: string; dot: string; ring: string }> = {
  0: { label: 'today',      dot: '#dc2626', ring: '#fecaca' },
  1: { label: 'this week',  dot: '#ea580c', ring: '#fed7aa' },
  2: { label: 'this month', dot: '#d97706', ring: '#fde68a' },
  3: { label: 'this year',  dot: '#0d9488', ring: '#99f6e4' },
  4: { label: 'goals',      dot: '#4f46e5', ring: '#c7d2fe' },
  5: { label: 'periphery',  dot: '#9ca3af', ring: '#e5e7eb' },
}

// ── Ring geometry ─────────────────────────────────────────────────────────────
//
// Radii are computed from what each ring holds rather than fixed. Two things
// were wrong with fixed, evenly spaced rings: today got the same width as every
// other horizon despite being the one you are meant to be reading, and a ring
// with more notes than its circumference could hold just overlapped its labels.

/** Horizontal room one label wants before it collides with its neighbour. */
const LABEL_PITCH = 155
/** Radial room one row of labels needs. */
const ROW_HEIGHT = 70

/**
 * Default minimum band width per ring, narrowing outward.
 *
 * This is the "most area on today" part: the innermost band is the widest it
 * can be, and each horizon out gets less. A ring can still grow past its
 * minimum if it holds too many notes to fit, but it never shrinks below it.
 */
export const DEFAULT_BANDS = [520, 380, 290, 230, 190, 520]
/** How far a band may grow to fit its contents before it is allowed to crowd. */
const MAX_BAND = [900, 800, 700, 600, 600, 2600]

/** Bounds the settings panel offers for a hand-set band. */
export const BAND_MIN = 120
export const BAND_MAX = 1800

export type RingSettings = {
  /** Per-ring minimum band width, innermost first. */
  bands: number[]
  /** Let a band grow past its minimum when its contents will not fit. */
  autoFit: boolean
}

export const DEFAULT_RING_SETTINGS: RingSettings = {
  bands: DEFAULT_BANDS,
  autoFit: true,
}

/**
 * Radius of each ring's outer edge.
 *
 * Cheap and run once per load: at most a few dozen iterations of arithmetic over
 * six rings. Nothing here touches the nodes themselves.
 *
 * With autoFit off the bands are exactly what was asked for, which is the point
 * of being able to set them — a ring you deliberately made narrow should stay
 * narrow even if its labels then crowd.
 */
export function computeRingRadii(
  counts: number[],
  settings: RingSettings = DEFAULT_RING_SETTINGS,
): number[] {
  const radii: number[] = []
  let inner = 0

  for (let ring = 0; ring <= PERIPHERY_RING; ring++) {
    const count = counts[ring] ?? 0
    const asked = settings.bands[ring] ?? DEFAULT_BANDS[ring] ?? 200
    let band = Math.min(BAND_MAX, Math.max(BAND_MIN, asked))
    const max = Math.max(band, MAX_BAND[ring] ?? 800)

    // Grow until the band's own circumference — over however many rows of
    // labels fit in it — can hold the ring's notes.
    while (settings.autoFit && band < max) {
      const outer = inner + band
      const rows = Math.max(1, Math.floor(band / ROW_HEIGHT))
      const capacity = (rows * 2 * Math.PI * ((inner + outer) / 2)) / LABEL_PITCH
      if (capacity >= count) break
      band += 40
    }

    inner += band
    radii.push(inner)
  }
  return radii
}

/** Fallback for callers with no counts to hand (peek cards, colour lookups). */
export const DEFAULT_RADII = computeRingRadii([0, 0, 0, 0, 0, 0])

export function ringStyle(ring: number) {
  return RING_STYLE[ring] ?? RING_STYLE[PERIPHERY_RING]
}

/**
 * Where a node sits when nothing has been placed by hand.
 *
 * Derived from the id alone — not from its index in the ring.
 *
 * Index-based placement looked tidier (an even spread round the circle) but it
 * means membership changes move everyone: dropping one note from a 20-note ring
 * shifted 18 of the other 19, by up to 79px. Ring 0 turns over every single day,
 * so that is a canvas that rearranges itself under you each morning, which is
 * the exact failure that makes a re-simulating graph view useless to think in.
 *
 * The cost is some clumping, since a hash spreads less evenly than an index.
 * That is the right trade: an uneven ring you can learn the shape of beats a
 * tidy one you cannot.
 */
export function defaultPosition(node: OrgGraphNode, radii: number[]) {
  // Two independent hashes: one for the angle, one for the radius. Slicing bits
  // out of a single 32-bit hash correlates them and lays nodes on a spiral.
  let a = 2166136261
  for (let i = 0; i < node.id.length; i++) {
    a ^= node.id.charCodeAt(i)
    a = Math.imul(a, 16777619)
  }
  let r = 5381
  for (let i = node.id.length - 1; i >= 0; i--) {
    r = (Math.imul(r, 33) ^ node.id.charCodeAt(i)) | 0
  }

  const outer = radii[node.ring] ?? radii[radii.length - 1]
  const inner = node.ring === 0 ? 0 : (radii[node.ring - 1] ?? 0)

  const angle = ((a >>> 0) % 100000) / 100000 * 2 * Math.PI
  // Inside the band, not on its rim: notes spread across the width the ring was
  // grown to give them, leaving the edge clear for the ring's own label.
  const t = ((r >>> 0) % 1000) / 1000
  const radius = inner + (outer - inner) * (0.18 + t * 0.66)

  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

/** Inner and outer radius of a ring's band. */
export function bandOf(ring: number, radii: number[]): { inner: number; outer: number } {
  return {
    inner: ring === 0 ? 0 : (radii[ring - 1] ?? 0),
    outer: radii[ring] ?? radii[radii.length - 1] ?? 0,
  }
}

/**
 * Turn a dropped point into what the drop *meant*.
 *
 * An absolute x/y freezes a note against a geometry that then changes under it:
 * widen the today band and every note you had placed in this week is suddenly
 * inside today, swallowed by a ring it never belonged to. Angle plus a fraction
 * across the band survives that, because it says which ring and where in it
 * rather than how many pixels from the origin.
 */
export function toPolar(x: number, y: number, radii: number[]) {
  const ring = ringAtRadius(x, y, radii)
  const { inner, outer } = bandOf(ring, radii)
  const d = Math.hypot(x, y)
  const span = outer - inner
  return {
    angle: Math.atan2(y, x),
    bandT: span > 0 ? Math.min(1, Math.max(0, (d - inner) / span)) : 0.5,
    placedRing: ring,
  }
}

/** The inverse: where a stored placement lands under the current geometry. */
export function fromPolar(
  p: { angle: number; bandT: number; placedRing: number },
  radii: number[],
) {
  const { inner, outer } = bandOf(p.placedRing, radii)
  const r = inner + (outer - inner) * p.bandT
  return { x: Math.cos(p.angle) * r, y: Math.sin(p.angle) * r }
}

/** Positions for every node: saved ones win, the rest fall on their ring. */
export function layout(
  nodes: OrgGraphNode[],
  positions: OrgPosition[],
  radii: number[],
): Map<string, { x: number; y: number; pinned: boolean }> {
  const saved = new Map(positions.map(p => [p.orgId, p]))
  const out = new Map<string, { x: number; y: number; pinned: boolean }>()

  const byRing = new Map<number, OrgGraphNode[]>()
  for (const n of nodes) {
    const bucket = byRing.get(n.ring)
    if (bucket) bucket.push(n)
    else byRing.set(n.ring, [n])
  }

  for (const bucket of byRing.values()) {
    for (const n of bucket) {
      const s = saved.get(n.id)
      if (!s) {
        out.set(n.id, { ...defaultPosition(n, radii), pinned: false })
        continue
      }
      // Polar when we have it, so the note rides its band. Rows written before
      // polar placement fall back to their frozen coordinates until the canvas
      // converts them — see backfillPolar.
      const polar = s.angle !== null && s.bandT !== null && s.placedRing !== null
        ? fromPolar({ angle: s.angle, bandT: s.bandT, placedRing: s.placedRing }, radii)
        : { x: s.x, y: s.y }
      out.set(n.id, { ...polar, pinned: s.pinned })
    }
  }
  return out
}

export function toRFNodes(
  nodes: OrgGraphNode[],
  pos: Map<string, { x: number; y: number; pinned: boolean }>,
  degree: Map<string, number>,
): RFNode[] {
  return nodes.map(n => {
    const p = pos.get(n.id) ?? { x: 0, y: 0, pinned: false }
    return {
      id: n.id,
      type: 'orgNode',
      position: { x: p.x, y: p.y },
      data: {
        nodeId: n.id,
        title: n.title,
        ring: n.ring,
        age: n.age,
        tags: n.tags,
        todo: n.todo,
        pinned: p.pinned,
        degree: degree.get(n.id) ?? 0,
      },
    }
  })
}

export function toRFEdges(
  links: OrgGraphLink[],
  nodeIds: Set<string>,
  /** The selected note, when there is one — its own edges are the lit ones. */
  selectedId?: string | null,
): RFEdge[] {
  return links
    .filter(l => nodeIds.has(l.source) && nodeIds.has(l.dest))
    .map(l => {
      // Incident to the selection, not merely between two highlighted nodes:
      // two neighbours of the same note are both lit, but the line between them
      // is not part of what this selection is showing.
      const lit = Boolean(selectedId) && (l.source === selectedId || l.dest === selectedId)
      return {
        id: `${l.source}->${l.dest}`,
        source: l.source,
        target: l.dest,
        type: 'default',
        zIndex: lit ? 1 : 0,
        // Nothing here listens to an edge, and the default 20px invisible
        // interaction path turns a dense centre into a mat of click targets
        // sitting over anything drawn beneath the edge layer.
        interactionWidth: 0,
        // Only on the lit edges: a thousand labels at once is a word cloud, and
        // the selection is the moment you are asking what connects to what.
        ...(lit && l.label ? {
          label: l.label,
          labelStyle: { fontSize: 10, fill: '#4338ca', fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          labelBgPadding: [3, 1] as [number, number],
        } : {}),
        style: lit
          ? { stroke: '#6366f1', strokeWidth: 1.8 }
          : { stroke: '#d1d5db', strokeWidth: 1, opacity: selectedId ? 0.1 : 1 },
      }
    })
}

export function degreeOf(links: OrgGraphLink[]): Map<string, number> {
  const d = new Map<string, number>()
  for (const l of links) {
    d.set(l.source, (d.get(l.source) ?? 0) + 1)
    d.set(l.dest, (d.get(l.dest) ?? 0) + 1)
  }
  return d
}

/**
 * Goals with nothing in the current rings routing to them.
 *
 * This is the gap in the transport plan: a goal you are not, this week, doing
 * anything that reaches. Computed over the undirected link graph because an org
 * link is a stated relation, not a direction of travel.
 */
export function unreachedGoals(
  nodes: OrgGraphNode[],
  links: OrgGraphLink[],
  fromRings = [0, 1],
  maxHops = 3,
): OrgGraphNode[] {
  const adj = new Map<string, string[]>()
  for (const l of links) {
    ;(adj.get(l.source) ?? adj.set(l.source, []).get(l.source)!).push(l.dest)
    ;(adj.get(l.dest) ?? adj.set(l.dest, []).get(l.dest)!).push(l.source)
  }

  const seen = new Set<string>()
  let frontier = nodes.filter(n => fromRings.includes(n.ring)).map(n => n.id)
  for (const id of frontier) seen.add(id)

  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (seen.has(nb)) continue
        seen.add(nb)
        next.push(nb)
      }
    }
    if (next.length === 0) break
    frontier = next
  }

  return nodes.filter(n => n.ring === 4 && !seen.has(n.id))
}

/**
 * Which ring a placed position falls in, by distance from the centre.
 *
 * The inverse of the layout: given where something sits, what horizon does its
 * position claim?
 */
export function ringAtRadius(x: number, y: number, radii: number[]): number {
  const d = Math.hypot(x, y)
  for (let ring = 0; ring <= PERIPHERY_RING; ring++) {
    if (d <= (radii[ring] ?? Infinity)) return ring
  }
  return PERIPHERY_RING
}

export type Drift = {
  node: OrgGraphNode
  /** The ring the note was dragged into. */
  placed: number
  /** The ring its horizon files say it belongs to. */
  horizon: number
}

/**
 * Notes placed nearer the centre than their horizon warrants.
 *
 * This is the point of computing position and horizon independently. A note you
 * dragged into the middle whose horizon still says "periphery" is saying
 * something specific and worth reading: it matters to you, and nothing you have
 * written down this week reaches it. That gap is the missing edge.
 *
 * Only inward drift counts. Something parked out at the rim is just filed.
 */
export function drifted(
  nodes: OrgGraphNode[],
  pos: Map<string, { x: number; y: number; pinned: boolean }>,
  radii: number[],
): Drift[] {
  const out: Drift[] = []
  for (const node of nodes) {
    const p = pos.get(node.id)
    if (!p?.pinned) continue
    // A routine note has no horizon to disagree with — it sits in the readout,
    // and is only in the periphery because that is where un-ringed notes go.
    // Reporting it as drifted says "nothing reaches this", which is false.
    if (node.routine) continue
    const placed = ringAtRadius(p.x, p.y, radii)
    if (placed < node.ring) out.push({ node, placed, horizon: node.ring })
  }
  return out.sort((a, b) => (a.placed - b.placed) || (b.horizon - a.horizon))
}

/** Ids linked to or from `id`, plus `id` itself. Used to spotlight a selection. */
export function neighbourhood(id: string, links: OrgGraphLink[]): Set<string> {
  const out = new Set<string>([id])
  for (const l of links) {
    if (l.source === id) out.add(l.dest)
    else if (l.dest === id) out.add(l.source)
  }
  return out
}
