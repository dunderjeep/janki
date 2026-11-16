import type { GraphNodeSummary, GraphEdgeSummary, CardMastery } from '@/lib/graphStore'
import type { Node as RFNode, Edge as RFEdge } from 'reactflow'

export type NodeKindStyle = {
  border: string
  bg: string
  badge: string
  badgeText: string
}

export type NodeKindVisual = NodeKindStyle & {
  /** Single glyph shown in place of the kind badge when zoomed out. */
  glyph: string
  /** Solid colour for the zoomed-out dot and the minimap. */
  dot: string
}

// Dot colours are two Tailwind steps darker than the border/fill classes beside
// them. Those were tuned against a white node card; the zoomed-out dot sits on
// the cluster frame's grey wash at a few pixels across, where a -400 tint is
// barely distinguishable from the background.
export const KIND_STYLES: Record<string, NodeKindVisual> = {
  Type:     { border: 'border-blue-400',   bg: 'bg-blue-50',   badge: 'bg-blue-100',   badgeText: 'text-blue-700',   glyph: 'T', dot: '#2563eb' },
  Property: { border: 'border-purple-400', bg: 'bg-purple-50', badge: 'bg-purple-100', badgeText: 'text-purple-700', glyph: 'P', dot: '#7c3aed' },
  Place:    { border: 'border-green-400',  bg: 'bg-green-50',  badge: 'bg-green-100',  badgeText: 'text-green-700',  glyph: '◎', dot: '#059669' },
  Card:     { border: 'border-amber-400',  bg: 'bg-amber-50',  badge: 'bg-amber-100',  badgeText: 'text-amber-700',  glyph: 'C', dot: '#d97706' },
  Deck:     { border: 'border-teal-400',   bg: 'bg-teal-50',   badge: 'bg-teal-100',   badgeText: 'text-teal-700',   glyph: 'D', dot: '#0d9488' },
  Topic:    { border: 'border-sky-400',    bg: 'bg-sky-50',    badge: 'bg-sky-100',    badgeText: 'text-sky-700',    glyph: '#', dot: '#0284c7' },
  default:  { border: 'border-gray-300',   bg: 'bg-white',     badge: 'bg-gray-100',   badgeText: 'text-gray-600',   glyph: '·', dot: '#4b5563' },
}

export function getKindStyle(kind?: string | null): NodeKindVisual {
  return KIND_STYLES[kind ?? ''] ?? KIND_STYLES.default
}

// STUDY OVERLAY
//
// Recolours the canvas by how study has actually gone, which is the one thing
// the map can show that the deck list cannot: not "what is in here" but "which
// of this is falling over". Kind colour answers a question you can already
// answer by looking at the shape of the graph.

export type OverlayMode = 'off' | 'mastery' | 'staleness'

/** What a node is worth on the current overlay. Null renders as "no data". */
export type OverlayValue = { score: number | null; reps: number; days: number | null }

const NO_DATA = '#d1d5db'

/** Red → amber → green. 0 is trouble, 1 is solid, on both overlays. */
function ramp(t: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [220, 38, 38]],    // red-600
    [0.5, [245, 158, 11]], // amber-500
    [1, [22, 163, 74]],    // green-600
  ]
  const x = Math.min(1, Math.max(0, t))
  let i = 1
  while (i < stops.length - 1 && x > stops[i][0]) i++
  const [t0, c0] = stops[i - 1]
  const [t1, c1] = stops[i]
  const f = (x - t0) / (t1 - t0)
  // Hex, not rgb(): callers append a two-digit alpha to get the frame wash.
  const ch = (a: number, b: number) =>
    Math.round(a + (b - a) * f).toString(16).padStart(2, '0')
  return `#${ch(c0[0], c1[0])}${ch(c0[1], c1[1])}${ch(c0[2], c1[2])}`
}

/** Days since last review beyond which a card counts as fully cold. */
export const STALE_DAYS = 90

export function overlayColor(mode: OverlayMode, v: OverlayValue | undefined): string | null {
  if (mode === 'off' || !v) return null
  if (mode === 'mastery') return v.score === null ? NO_DATA : ramp(v.score)
  if (v.days === null) return NO_DATA
  return ramp(1 - Math.min(1, v.days / STALE_DAYS))
}

/**
 * Spread study history from cards to everything above them.
 *
 * Only Cards are ever reviewed, so a Topic or Deck left uncoloured would leave
 * the map blank at exactly the zoom where the overlay is meant to be read. Each
 * container takes the mean of the cards beneath it — which is the question you
 * are actually asking of a topic: how is this area going, on the whole.
 */
export function buildOverlay(
  nodes: GraphNodeSummary[],
  edges: GraphEdgeSummary[],
  mastery: CardMastery[],
): Map<string, OverlayValue> {
  const now = Date.now()
  const out = new Map<string, OverlayValue>()

  const byCard = new Map<string, CardMastery>()
  for (const m of mastery) byCard.set(m.id, m)

  for (const n of nodes) {
    if (n.kind !== 'Card') continue
    const m = byCard.get(n.id)
    out.set(n.id, {
      score: m?.ease ?? null,
      reps: m?.reps ?? 0,
      days: m?.lastReviewedAt
        ? Math.floor((now - new Date(m.lastReviewedAt).getTime()) / 86_400_000)
        : null,
    })
  }

  // Accumulate onto the containers a card points at. IN_TOPIC / IN_DECK both run
  // card -> container, so the target is the thing being summarised.
  const acc = new Map<string, { sum: number; n: number; reps: number; newest: number | null }>()
  for (const e of edges) {
    if (e.type !== 'IN_TOPIC' && e.type !== 'IN_DECK') continue
    const v = out.get(e.fromNodeId)
    if (!v) continue
    const a = acc.get(e.toNodeId) ?? { sum: 0, n: 0, reps: 0, newest: null }
    if (v.score !== null) { a.sum += v.score; a.n++ }
    a.reps += v.reps
    if (v.days !== null) a.newest = a.newest === null ? v.days : Math.min(a.newest, v.days)
    acc.set(e.toNodeId, a)
  }

  for (const [id, a] of acc) {
    out.set(id, { score: a.n > 0 ? a.sum / a.n : null, reps: a.reps, days: a.newest })
  }
  return out
}

// LEVEL OF DETAIL
// Below these zoom levels the canvas drops node chrome and edge labels. At 1200
// nodes the labels alone are thousands of DOM/SVG nodes, and they're unreadable
// when zoomed out anyway.
export const LOD_DOT_ZOOM = 0.35   // below: coloured dot only
export const LOD_LABEL_ZOOM = 0.7  // below: glyph, no text label
export const LOD_EDGE_LABEL_ZOOM = 0.9 // below: no edge labels

export type LodLevel = 'dot' | 'glyph' | 'full'

/** The dot's size in canvas units before any counter-scaling. */
export const DOT_BASE_PX = 14
/** How large a dot must stay on screen to read as a mark rather than as noise. */
export const MIN_DOT_SCREEN_PX = 5.8
/** Ceiling on the counter-scale, so dots inside a cluster stay separate marks. */
const MAX_DOT_SCALE = 10

/**
 * How much to grow a dot so it survives being zoomed out.
 *
 * A 14 px dot at the whole-graph zoom of ~0.06 lands on a fifth of a screen
 * pixel, which the browser renders as a barely-tinted smear — the reason the
 * overview looks like a field of empty circles. Growing the dot in canvas units
 * keeps its on-screen size at MIN_DOT_SCREEN_PX instead.
 *
 * Quantised to half-steps on purpose: QuiltNode subscribes to this value, and an
 * unrounded scale would re-render every dot on every wheel tick.
 */
export function dotScaleFor(zoom: number): number {
  const needed = MIN_DOT_SCREEN_PX / (DOT_BASE_PX * Math.max(zoom, 0.01))
  if (needed <= 1) return 1
  return Math.min(Math.ceil(needed * 2) / 2, MAX_DOT_SCALE)
}

export function lodFor(zoom: number): LodLevel {
  if (zoom < LOD_DOT_ZOOM) return 'dot'
  if (zoom < LOD_LABEL_ZOOM) return 'glyph'
  return 'full'
}

export type NodeUi = { x?: number; y?: number; cluster?: string }

export function readUi(ui: unknown): NodeUi {
  return (ui ?? {}) as NodeUi
}

/** Cluster keys written by scripts/layout-graph.ts for nodes with no deck. */
export const LOOSE_CLUSTER = '__loose'
export const SCHEMA_CLUSTER = '__schema'

/**
 * The line under each node label. Replaces the kind badge, which only repeated
 * what the border and fill colour already say.
 *
 * Must be built from the unfiltered edge set — computing it after collapse would
 * count only the surviving edges and report a deck as having 3 cards.
 */
export function buildNodeContext(
  nodes: GraphNodeSummary[],
  edges: GraphEdgeSummary[],
): Map<string, string> {
  const labelById = new Map(nodes.map(n => [n.id, n.label]))
  const kindById = new Map(nodes.map(n => [n.id, n.kind ?? '']))

  const cardsInTopic = new Map<string, number>()
  const cardsInDeck = new Map<string, number>()
  const topicsOfCard = new Map<string, string[]>()
  const topicsOfDeck = new Map<string, number>()

  for (const e of edges) {
    if (e.type === 'IN_TOPIC') {
      cardsInTopic.set(e.toNodeId, (cardsInTopic.get(e.toNodeId) ?? 0) + 1)
      const list = topicsOfCard.get(e.fromNodeId)
      const topicLabel = labelById.get(e.toNodeId)
      if (topicLabel) {
        if (list) list.push(topicLabel)
        else topicsOfCard.set(e.fromNodeId, [topicLabel])
      }
    } else if (e.type === 'IN_DECK') {
      cardsInDeck.set(e.toNodeId, (cardsInDeck.get(e.toNodeId) ?? 0) + 1)
    } else if (e.type === 'DEFAULT_TOPIC') {
      topicsOfDeck.set(e.fromNodeId, (topicsOfDeck.get(e.fromNodeId) ?? 0) + 1)
    }
  }

  const context = new Map<string, string>()
  for (const n of nodes) {
    const kind = kindById.get(n.id)
    if (kind === 'Deck') {
      const cards = cardsInDeck.get(n.id) ?? 0
      const topics = topicsOfDeck.get(n.id) ?? 0
      context.set(n.id, topics > 0 ? `C${cards} · #${topics}` : `C${cards}`)
    } else if (kind === 'Topic') {
      context.set(n.id, `C${cardsInTopic.get(n.id) ?? 0}`)
    } else if (kind === 'Card') {
      const topics = topicsOfCard.get(n.id)
      if (topics?.length) {
        const shown = topics.slice(0, 2).join(' · ')
        context.set(n.id, topics.length > 2 ? `${shown} +${topics.length - 2}` : shown)
      }
    }
  }
  return context
}

export function toRFNode(node: GraphNodeSummary, context?: Map<string, string>): RFNode {
  const ui = node.ui as { x?: number; y?: number } | null
  return {
    id: node.id,
    type: 'quiltNode',
    position: { x: ui?.x ?? 0, y: ui?.y ?? 0 },
    data: {
      label: node.label,
      kind: node.kind ?? undefined,
      nodeId: node.id,
      context: context?.get(node.id),
    },
  }
}

export function toRFEdge(edge: GraphEdgeSummary, showLabel: boolean): RFEdge {
  return {
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: edge.fromPortId ?? undefined,
    targetHandle: edge.toPortId ?? undefined,
    label: showLabel ? edge.type : undefined,
    type: 'default',
    style: { stroke: '#9ca3af', strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fill: '#6b7280' },
    labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
  }
}

// CLUSTER COLLAPSE
//
// A fully collapsed deck (one node, everything else gone) throws away the sense
// of what the cluster contains. Instead each collapsed cluster keeps its deck
// plus its best-connected members as a "peek", and a chip reports the remainder.
// Peek nodes keep their real layout positions, so expanding never makes the
// canvas jump.

export type ClusterChip = {
  clusterKey: string
  hiddenCount: number
  expanded: boolean
  x: number
  y: number
}

export type CollapseResult = {
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  chips: ClusterChip[]
}

/** Clusters small enough that collapsing them saves nothing. */
const MIN_COLLAPSIBLE_SIZE = 4

export function collapseClusters(
  nodes: GraphNodeSummary[],
  edges: GraphEdgeSummary[],
  opts: { enabled: boolean; expanded: ReadonlySet<string>; peekCount: number },
): CollapseResult {
  if (!opts.enabled) return { nodes, edges, chips: [] }

  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1)
    degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1)
  }

  const byCluster = new Map<string, GraphNodeSummary[]>()
  const unclustered: GraphNodeSummary[] = []
  for (const n of nodes) {
    const key = readUi(n.ui).cluster
    // Schema nodes are few and are the type system's backbone — never collapse.
    if (!key || key === SCHEMA_CLUSTER) {
      unclustered.push(n)
      continue
    }
    const bucket = byCluster.get(key)
    if (bucket) bucket.push(n)
    else byCluster.set(key, [n])
  }

  const kept: GraphNodeSummary[] = [...unclustered]
  const chips: ClusterChip[] = []

  for (const [key, members] of byCluster) {
    const expanded = opts.expanded.has(key)

    if (members.length < MIN_COLLAPSIBLE_SIZE) {
      kept.push(...members)
      continue
    }

    if (expanded) {
      kept.push(...members)
      chips.push({ clusterKey: key, hiddenCount: 0, expanded: true, ...clusterCentre(members) })
      continue
    }

    // The deck anchors its cluster; the unfiled bin has no anchor and is fine.
    const anchor = members.find(n => n.kind === 'Deck') ?? null
    const rest = members.filter(n => n !== anchor)

    const peek = pickPeek(rest, degree, opts.peekCount)
    const peekIds = new Set(peek.map(n => n.id))
    const hiddenNodes = rest.filter(n => !peekIds.has(n.id))

    if (anchor) kept.push(anchor)
    kept.push(...peek)

    if (hiddenNodes.length > 0) {
      chips.push({
        clusterKey: key,
        hiddenCount: hiddenNodes.length,
        expanded: false,
        // Sit the chip in the mass of what's hidden, not on top of the peek.
        ...clusterCentre(hiddenNodes),
      })
    }
  }

  const keptIds = new Set(kept.map(n => n.id))
  const keptEdges = edges.filter(e => keptIds.has(e.fromNodeId) && keptIds.has(e.toNodeId))

  return { nodes: kept, edges: keptEdges, chips }
}

/**
 * Choose the peek members, round-robin across kinds rather than straight by degree.
 *
 * Pure degree ranking hands the whole peek to Topics — they collect an IN_TOPIC
 * edge from every card, so a deck's peek came out as five tag-like topics and no
 * cards at all. Alternating kinds keeps both the deck's shape and a sample of its
 * actual contents.
 */
function pickPeek(
  rest: GraphNodeSummary[],
  degree: Map<string, number>,
  peekCount: number,
): GraphNodeSummary[] {
  const byKind = new Map<string, GraphNodeSummary[]>()
  for (const n of rest) {
    const kind = n.kind ?? ''
    const bucket = byKind.get(kind)
    if (bucket) bucket.push(n)
    else byKind.set(kind, [n])
  }

  for (const bucket of byKind.values()) {
    bucket.sort((a, b) =>
      (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label)
    )
  }

  // Largest kinds first, so the dominant content of a cluster leads the peek.
  const buckets = [...byKind.values()].sort((a, b) => b.length - a.length)

  const peek: GraphNodeSummary[] = []
  for (let round = 0; peek.length < peekCount; round++) {
    let placed = false
    for (const bucket of buckets) {
      if (round >= bucket.length) continue
      peek.push(bucket[round])
      placed = true
      if (peek.length === peekCount) break
    }
    if (!placed) break // every bucket exhausted
  }
  return peek
}

function clusterCentre(members: GraphNodeSummary[]): { x: number; y: number } {
  let sx = 0
  let sy = 0
  let n = 0
  for (const m of members) {
    const ui = readUi(m.ui)
    if (typeof ui.x !== 'number' || typeof ui.y !== 'number') continue
    sx += ui.x
    sy += ui.y
    n++
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 }
}

// VIEW FILTERS
export type GraphView = 'all' | 'types' | 'entities'

// Max nodes to render on the ReactFlow canvas at once — a safety valve, not the
// primary control. Truncation takes an arbitrary slice and so cuts clusters in
// half; focus mode is the intended way to narrow the view. Set above the current
// graph size (1241 nodes) so the overview stays whole.
export const CANVAS_NODE_LIMIT = 1500

const SRS_KINDS = new Set(['Card', 'Deck', 'Topic'])

export function filterForView(
  nodes: GraphNodeSummary[],
  edges: GraphEdgeSummary[],
  view: GraphView,
  asOf: Date | null,
  hideSrs: boolean,
): { nodes: GraphNodeSummary[]; edges: GraphEdgeSummary[] } {
  let filteredNodes = nodes
  let filteredEdges = edges

  // Hide SRS nodes (Card/Deck/Topic) — biggest dataset reduction
  if (hideSrs) {
    filteredNodes = filteredNodes.filter(n => !SRS_KINDS.has(n.kind ?? ''))
  }

  // Temporal filter
  if (asOf) {
    filteredNodes = filteredNodes.filter(n => {
      if (n.validFrom && new Date(n.validFrom) > asOf) return false
      if (n.validTo && new Date(n.validTo) <= asOf) return false
      return true
    })
    filteredEdges = filteredEdges.filter(e => {
      if (e.validFrom && new Date(e.validFrom) > asOf) return false
      if (e.validTo && new Date(e.validTo) <= asOf) return false
      return true
    })
  }

  if (view === 'types') {
    filteredNodes = filteredNodes.filter(n => n.kind === 'Type' || n.kind === 'Property')
    filteredEdges = filteredEdges.filter(e => e.type === 'IS_A' || e.type === 'HAS_PROPERTY')
  } else if (view === 'entities') {
    filteredNodes = filteredNodes.filter(n => n.kind !== 'Type' && n.kind !== 'Property')
    filteredEdges = filteredEdges.filter(e => e.type !== 'IS_A' && e.type !== 'HAS_PROPERTY')
  }

  // Only keep edges where both endpoints are in the filtered node set
  const nodeIdSet = new Set(filteredNodes.map(n => n.id))
  filteredEdges = filteredEdges.filter(e => nodeIdSet.has(e.fromNodeId) && nodeIdSet.has(e.toNodeId))

  return { nodes: filteredNodes, edges: filteredEdges }
}
