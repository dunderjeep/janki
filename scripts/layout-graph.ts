/**
 * Graph layout backfill — gives every janki graph node a real x/y position.
 *
 * Why: the Firebase migration wrote a single fallback coordinate for each kind
 * (see migrate-firebase.ts), so ~1100 of 1241 nodes share just two positions and
 * the Quilt canvas renders them as one pile. Nothing has ever laid this graph out.
 *
 * Approach: two levels of physics. Each cluster is laid out in isolation, then a
 * second simulation packs the clusters themselves as circles — collision keeps
 * them apart while the cross-cluster edges pull related decks together. Laying
 * clusters out separately guarantees they never overlap, which a single global
 * simulation cannot promise.
 *
 * Vertical gravity is biased so the whole arrangement settles at roughly 16:9.
 * That matters more than raw compactness: fitView is limited by whichever axis
 * binds, so a squarer arrangement wastes the viewport's width however tightly it
 * packs. See CLUSTER_GRAVITY_Y.
 *
 * Run:
 *   cd path/to/janki
 *   dotenv -e app/.env.local -- tsx scripts/layout-graph.ts [--dry-run] [--owner <uid>]
 *
 * Re-runnable: positions are recomputed from scratch every time and the RNG is
 * seeded, so the same graph always lays out the same way.
 */

import { Pool } from 'pg'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) throw new Error('DATABASE_URL is not set — run via dotenv -e app/.env.local --')

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const ownerArg = argv.indexOf('--owner')
const ONLY_OWNER = ownerArg !== -1 ? argv[ownerArg + 1] : null

// ── Tunables ──────────────────────────────────────────────────────────────────

/** Collision radius per kind — roughly half the rendered node width. */
const NODE_RADIUS: Record<string, number> = {
  Deck: 78,
  Topic: 58,
  Card: 50,
  Type: 48,
  Property: 44,
  default: 48,
}

/** Preferred edge length per relationship. Shorter = tighter grouping. */
const LINK_DISTANCE: Record<string, number> = {
  IN_DECK: 150,
  IN_TOPIC: 90,
  DEFAULT_TOPIC: 120,
  RELATED_TO: 160,
  IS_A: 110,
  HAS_PROPERTY: 90,
  default: 120,
}

/** Gap left between packed clusters. */
const CLUSTER_GAP = 130

/** Clearance added to each cluster's bounding circle during cluster packing. */
const CLUSTER_PAD = 30

/** Pull of each cluster toward the canvas centre. Higher = tighter, to a point. */
const CLUSTER_GRAVITY = 0.1

/** Vertical gravity multiplier — >1 flattens the arrangement to suit a wide screen. */
const CLUSTER_GRAVITY_Y = 3.4

/**
 * Gap inside the thin-deck block. 42 of 62 clusters are a single deck node whose
 * cards were never imported; shelf-packing them as full-size tiles strung them
 * out into long horizontal lines across the canvas. They are packed into their
 * own dense disc instead, and travel as a single circle.
 */
const THIN_GAP = 34

const SCHEMA_CLUSTER = '__schema'
const LOOSE_CLUSTER = '__loose'

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeRow = { id: string; label: string; kind: string | null }
type EdgeRow = { from_node_id: string; to_node_id: string; type: string }

type SimNode = SimulationNodeDatum & { id: string; kind: string; r: number }
type SimLink = SimulationLinkDatum<SimNode> & { type: string }

// ── Seeded RNG ────────────────────────────────────────────────────────────────
// d3-force's link and charge forces call Math.random() to jiggle coincident
// nodes — which is exactly our situation, since everything starts stacked.
// Swapping in a seeded PRNG for the duration makes runs reproducible.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random
  Math.random = mulberry32(seed)
  try {
    return fn()
  } finally {
    Math.random = original
  }
}

// ── Clustering ────────────────────────────────────────────────────────────────

/**
 * Assign every node to a cluster key. Decks anchor their own cluster; cards
 * follow their IN_DECK edge; topics follow DEFAULT_TOPIC, falling back to the
 * deck most of their cards belong to.
 */
function assignClusters(nodes: NodeRow[], edges: EdgeRow[]): Map<string, string> {
  const kindById = new Map(nodes.map((n) => [n.id, n.kind ?? '']))
  const cluster = new Map<string, string>()

  for (const n of nodes) {
    if (n.kind === 'Deck') cluster.set(n.id, n.id)
  }

  // Card --IN_DECK--> Deck
  for (const e of edges) {
    if (e.type === 'IN_DECK' && cluster.has(e.to_node_id)) {
      cluster.set(e.from_node_id, e.to_node_id)
    }
  }

  // Deck --DEFAULT_TOPIC--> Topic
  for (const e of edges) {
    if (e.type === 'DEFAULT_TOPIC' && cluster.has(e.from_node_id) && !cluster.has(e.to_node_id)) {
      cluster.set(e.to_node_id, cluster.get(e.from_node_id)!)
    }
  }

  // Remaining topics inherit the deck that most of their cards sit in.
  const topicVotes = new Map<string, Map<string, number>>()
  for (const e of edges) {
    if (e.type !== 'IN_TOPIC') continue
    if (cluster.has(e.to_node_id)) continue
    const cardCluster = cluster.get(e.from_node_id)
    if (!cardCluster) continue
    let votes = topicVotes.get(e.to_node_id)
    if (!votes) {
      votes = new Map()
      topicVotes.set(e.to_node_id, votes)
    }
    votes.set(cardCluster, (votes.get(cardCluster) ?? 0) + 1)
  }
  for (const [topicId, votes] of topicVotes) {
    let best: string | null = null
    let bestCount = 0
    for (const [c, count] of votes) {
      if (count > bestCount) {
        best = c
        bestCount = count
      }
    }
    if (best) cluster.set(topicId, best)
  }

  // Everything left: schema nodes get their own cluster, orphans share one.
  for (const n of nodes) {
    if (cluster.has(n.id)) continue
    const kind = kindById.get(n.id) ?? ''
    cluster.set(n.id, kind === 'Type' || kind === 'Property' ? SCHEMA_CLUSTER : LOOSE_CLUSTER)
  }

  return cluster
}

// ── Per-cluster force layout ──────────────────────────────────────────────────

/** Golden angle — successive points land in the previous ring's gaps. */
const GOLDEN_ANGLE = 2.399963229728653

/**
 * Phyllotaxis disc: uniform spacing, but a *round* footprint.
 *
 * Scaling by cell/sqrt(pi) makes the area per point equal a grid cell, so this
 * is exactly as dense as a grid while fitting a tight bounding circle. That
 * matters because clusters are packed as circles — a 2356x1368 grid needs a
 * circle 45% larger than its own area, which is what made circle packing lose
 * to shelf packing on the first attempt.
 */
function layoutDisc(nodes: SimNode[], cell: number): void {
  const c = cell / Math.sqrt(Math.PI)
  nodes.forEach((n, i) => {
    const angle = i * GOLDEN_ANGLE
    const radius = c * Math.sqrt(i)
    n.x = radius * Math.cos(angle)
    n.y = radius * Math.sin(angle)
  })
}

/**
 * Layout for clusters with no internal edges (the "unfiled" bin — 107 topics and
 * 50 cards have no relationships at all). A force simulation on edgeless nodes is
 * pure repulsion, which just sprawls.
 */
function layoutLooseDisc(nodes: SimNode[]): void {
  layoutDisc(nodes, 2 * Math.max(...nodes.map((n) => n.r)) + 24)
}

function layoutCluster(nodes: SimNode[], links: SimLink[], seed: number): void {
  // A handful of unfiled nodes do link to each other, but the bin is a bin —
  // grid it regardless rather than letting a few edges drag 163 nodes around.
  if (links.length === 0) {
    layoutLooseDisc(nodes)
    return
  }

  // Deterministic phyllotaxis seeding. Without this every node starts at the
  // same migration coordinate and the simulation has nothing to push apart.
  nodes.forEach((n, i) => {
    const angle = i * 2.399963229728653
    const radius = 14 * Math.sqrt(i)
    n.x = radius * Math.cos(angle)
    n.y = radius * Math.sin(angle)
    n.vx = 0
    n.vy = 0
  })

  if (nodes.length === 1) {
    nodes[0].x = 0
    nodes[0].y = 0
    return
  }

  withSeededRandom(seed, () => {
    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => LINK_DISTANCE[l.type] ?? LINK_DISTANCE.default)
          .strength(0.6),
      )
      .force('charge', forceManyBody<SimNode>().strength(-320).distanceMax(900))
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => d.r + 14)
          .iterations(4),
      )
      // Mild pull toward the cluster origin keeps it compact and centred. Equal
      // strengths so clusters settle round — an elliptical cluster wastes space
      // inside the bounding circle the cluster packer places it by.
      .force('x', forceX<SimNode>(0).strength(0.06))
      .force('y', forceY<SimNode>(0).strength(0.06))
      .stop()

    // Run the simulation to completion synchronously.
    const ticks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()))
    for (let i = 0; i < ticks; i++) sim.tick()
  })
}

// ── Cluster packing ───────────────────────────────────────────────────────────

type PackedCluster = {
  key: string
  nodes: SimNode[]
  w: number
  h: number
}

/**
 * Gather the single-node clusters into one dense grid so they occupy a compact
 * block rather than trailing across the canvas as separate shelf items.
 * Returns the block as a pseudo-cluster for the main packer to place.
 */
function packThinClusters(thin: PackedCluster[]): PackedCluster | null {
  if (thin.length === 0) return null

  const cell = Math.max(...thin.map((c) => Math.max(c.w, c.h))) + THIN_GAP
  const c = cell / Math.sqrt(Math.PI)

  // Same phyllotaxis disc as layoutDisc, but placing whole clusters rather than
  // single nodes. Centred on the origin by construction, which is what
  // packClusters assumes.
  const nodes: SimNode[] = []
  thin.forEach((cluster, i) => {
    const angle = i * GOLDEN_ANGLE
    const radius = c * Math.sqrt(i)
    const cx = radius * Math.cos(angle)
    const cy = radius * Math.sin(angle)
    for (const n of cluster.nodes) {
      // Cluster nodes are centred on 0,0 at this point.
      n.x = (n.x ?? 0) + cx
      n.y = (n.y ?? 0) + cy
      nodes.push(n)
    }
  })

  const span = 2 * (c * Math.sqrt(Math.max(thin.length - 1, 1)) + cell / 2)
  return { key: '__thin_block', nodes, w: span, h: span }
}

type ClusterAffinity = { source: string; target: string; weight: number }

type ClusterSimNode = SimulationNodeDatum & { key: string; r: number; cluster: PackedCluster }
type ClusterSimLink = SimulationLinkDatum<ClusterSimNode> & { weight: number }

/** Smallest circle centred on the cluster's own centre that covers every member. */
function boundingRadius(nodes: SimNode[]): number {
  let max = 0
  for (const n of nodes) {
    const d = Math.hypot(n.x ?? 0, n.y ?? 0) + n.r
    if (d > max) max = d
  }
  return Math.max(max, 40)
}

/**
 * Place clusters with physics rather than shelf rows.
 *
 * Each cluster becomes a circle sized to cover its members, and a second
 * simulation runs over those circles: collision keeps them apart, while the
 * cross-cluster edges pull related decks together. Shelf packing discarded that
 * signal entirely and wrapped clusters into arbitrary rows; circles nest into
 * each other's gaps and end up both tighter and meaningfully arranged.
 *
 * This runs offline — the browser only ever receives the resulting coordinates.
 */
function packClusters(all: PackedCluster[], affinity: ClusterAffinity[]): void {
  // Single-node clusters are the thin decks — block them together first so they
  // travel as one circle and keep their shared group frame.
  const thin = all.filter((c) => c.nodes.length === 1)
  const block = packThinClusters(thin)
  const clusters = all.filter((c) => c.nodes.length > 1)
  if (block) clusters.push(block)

  // Every thin cluster folded into the block, so affinity must follow.
  const thinKeys = new Set(thin.map((c) => c.key))
  const remap = (k: string) => (thinKeys.has(k) ? '__thin_block' : k)

  const simNodes: ClusterSimNode[] = clusters.map((c) => ({
    key: c.key,
    r: boundingRadius(c.nodes),
    cluster: c,
  }))
  const byKey = new Map(simNodes.map((n) => [n.key, n]))

  // Deterministic seeding: sort by size and lay out on a spiral, biggest first,
  // so the heavy clusters settle near the middle.
  const ordered = [...simNodes].sort((a, b) => b.r - a.r)
  ordered.forEach((n, i) => {
    const angle = i * 2.399963229728653
    const radius = 90 * Math.sqrt(i)
    n.x = radius * Math.cos(angle)
    n.y = radius * Math.sin(angle)
  })

  const simLinks: ClusterSimLink[] = []
  for (const a of affinity) {
    const s = remap(a.source)
    const t = remap(a.target)
    if (s === t) continue
    if (!byKey.has(s) || !byKey.has(t)) continue
    simLinks.push({ source: s, target: t, weight: a.weight })
  }
  const maxWeight = simLinks.reduce((m, l) => Math.max(m, l.weight), 1)

  withSeededRandom(20250802, () => {
    const sim = forceSimulation<ClusterSimNode>(simNodes)
      .force(
        'link',
        forceLink<ClusterSimNode, ClusterSimLink>(simLinks)
          .id((d) => d.key)
          // Related clusters sit just clear of each other's edges.
          .distance((l) => {
            const s = l.source as ClusterSimNode
            const t = l.target as ClusterSimNode
            return s.r + t.r + CLUSTER_GAP
          })
          .strength((l) => 0.08 + 0.5 * (l.weight / maxWeight)),
      )
      // Collision is what actually guarantees clusters do not touch.
      .force(
        'collide',
        forceCollide<ClusterSimNode>()
          .radius((d) => d.r + CLUSTER_PAD)
          .strength(1)
          .iterations(6),
      )
      // Gentle gravity toward the origin closes the gaps left by collision.
      .force('x', forceX<ClusterSimNode>(0).strength(CLUSTER_GRAVITY))
      .force('y', forceY<ClusterSimNode>(0).strength(CLUSTER_GRAVITY * CLUSTER_GRAVITY_Y))
      .stop()

    const ticks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()))
    for (let i = 0; i < ticks; i++) sim.tick()
  })

  // Translate each cluster's members to its settled centre.
  for (const sn of simNodes) {
    const dx = sn.x ?? 0
    const dy = sn.y ?? 0
    for (const n of sn.cluster.nodes) {
      n.x = (n.x ?? 0) + dx
      n.y = (n.y ?? 0) + dy
    }
  }

  // Report how much of the canvas the cluster circles actually claim — the
  // canvas bounding box alone is a misleading measure for round clusters.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let circleArea = 0
  let touching = 0
  for (const sn of simNodes) {
    circleArea += Math.PI * sn.r * sn.r
    minX = Math.min(minX, (sn.x ?? 0) - sn.r)
    minY = Math.min(minY, (sn.y ?? 0) - sn.r)
    maxX = Math.max(maxX, (sn.x ?? 0) + sn.r)
    maxY = Math.max(maxY, (sn.y ?? 0) + sn.r)
  }
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i], b = simNodes[j]
      if (Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) < a.r + b.r) touching++
    }
  }
  const canvasArea = (maxX - minX) * (maxY - minY)
  console.log(`  circle fill:     ${((100 * circleArea) / canvasArea).toFixed(1)}% of canvas`)
  console.log(`  overlapping circles: ${touching}`)
  console.log(`  affinity links:  ${simLinks.length} of ${affinity.length} applied`)
  // What actually matters is how much cluster area survives fitView on a wide
  // screen. Raw canvas area ignores aspect: a tall arrangement wastes the
  // viewport's width no matter how tightly it packs.
  const VW = 16, VH = 9
  const fit = Math.min(VW / (maxX - minX), VH / (maxY - minY))
  const onScreen = (100 * circleArea * fit * fit) / (VW * VH)
  console.log(`  screen fill:     ${onScreen.toFixed(1)}% of a 16:9 viewport`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function layoutOwner(pool: Pool, ownerUid: string): Promise<void> {
  // ORDER BY is load-bearing, not tidiness. Cluster iteration order decides
  // simulation seeds and phyllotaxis indices, so an unordered scan makes the
  // layout non-reproducible: each run rewrites the rows, Postgres returns them
  // in a different heap order, and the whole map reshuffles.
  const { rows: nodes } = await pool.query<NodeRow>(
    `SELECT id, label, props->>'kind' AS kind
       FROM janki.graph_nodes
      WHERE owner_uid = $1
      ORDER BY id`,
    [ownerUid],
  )
  const { rows: edges } = await pool.query<EdgeRow>(
    `SELECT from_node_id, to_node_id, type
       FROM janki.graph_edges
      WHERE owner_uid = $1
      ORDER BY id`,
    [ownerUid],
  )

  if (nodes.length === 0) {
    console.log(`  no nodes for ${ownerUid} — skipping`)
    return
  }

  const clusterOf = assignClusters(nodes, edges)

  // Bucket nodes by cluster.
  const buckets = new Map<string, SimNode[]>()
  const simNodeById = new Map<string, SimNode>()
  for (const n of nodes) {
    const kind = n.kind ?? ''
    const simNode: SimNode = {
      id: n.id,
      kind,
      r: NODE_RADIUS[kind] ?? NODE_RADIUS.default,
    }
    simNodeById.set(n.id, simNode)
    const key = clusterOf.get(n.id)!
    const bucket = buckets.get(key)
    if (bucket) bucket.push(simNode)
    else buckets.set(key, [simNode])
  }

  // Only intra-cluster edges participate in a cluster's simulation.
  const linksByCluster = new Map<string, SimLink[]>()
  // Cross-cluster edges are useless inside a cluster's own simulation, but they
  // are exactly the deck-to-deck affinity the cluster-level layout needs.
  // Nested maps rather than a delimited string key: cluster keys are opaque
  // nanoids, and a delimiter that disagrees with the split silently drops every
  // pair — which is exactly what happened here.
  const affinityWeights = new Map<string, Map<string, number>>()
  let crossClusterEdges = 0
  for (const e of edges) {
    const fromCluster = clusterOf.get(e.from_node_id)
    const toCluster = clusterOf.get(e.to_node_id)
    if (!fromCluster || !toCluster) continue
    if (fromCluster !== toCluster) {
      crossClusterEdges++
      const [a, b] = fromCluster < toCluster ? [fromCluster, toCluster] : [toCluster, fromCluster]
      let inner = affinityWeights.get(a)
      if (!inner) {
        inner = new Map()
        affinityWeights.set(a, inner)
      }
      inner.set(b, (inner.get(b) ?? 0) + 1)
      continue
    }
    const link: SimLink = { source: e.from_node_id, target: e.to_node_id, type: e.type }
    const existing = linksByCluster.get(fromCluster)
    if (existing) existing.push(link)
    else linksByCluster.set(fromCluster, [link])
  }

  // Lay out each cluster independently, then measure its footprint.
  const packed: PackedCluster[] = []
  let seed = 1
  for (const [key, bucketNodes] of buckets) {
    const clusterLinks = key === LOOSE_CLUSTER ? [] : (linksByCluster.get(key) ?? [])
    layoutCluster(bucketNodes, clusterLinks, seed++)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of bucketNodes) {
      minX = Math.min(minX, (n.x ?? 0) - n.r)
      minY = Math.min(minY, (n.y ?? 0) - n.r)
      maxX = Math.max(maxX, (n.x ?? 0) + n.r)
      maxY = Math.max(maxY, (n.y ?? 0) + n.r)
    }
    // Re-centre on the bounding box so packing offsets are exact.
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    for (const n of bucketNodes) {
      n.x = (n.x ?? 0) - cx
      n.y = (n.y ?? 0) - cy
    }

    packed.push({ key, nodes: bucketNodes, w: maxX - minX, h: maxY - minY })
  }

  const affinity: ClusterAffinity[] = []
  for (const [source, inner] of affinityWeights) {
    for (const [target, weight] of inner) affinity.push({ source, target, weight })
  }

  packClusters(packed, affinity)

  const ids: string[] = []
  const xs: number[] = []
  const ys: number[] = []
  const clusterKeys: string[] = []
  for (const n of simNodeById.values()) {
    ids.push(n.id)
    xs.push(Math.round(n.x ?? 0))
    ys.push(Math.round(n.y ?? 0))
    // Persisted so the canvas can collapse a deck without re-deriving membership.
    clusterKeys.push(clusterOf.get(n.id) ?? LOOSE_CLUSTER)
  }

  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const distinct = new Set(ids.map((_, i) => `${xs[i]},${ys[i]}`)).size

  console.log(`  nodes:           ${nodes.length}`)
  console.log(`  edges:           ${edges.length} (${crossClusterEdges} cross-cluster, excluded from sim)`)
  console.log(`  clusters:        ${packed.length}`)
  console.log(`  distinct coords: ${distinct} / ${ids.length}`)
  console.log(`  canvas extent:   ${spanX} x ${spanY}`)

  if (DRY_RUN) {
    const preview = [...packed].sort((a, b) => b.nodes.length - a.nodes.length).slice(0, 8)
    console.log('  largest clusters:')
    for (const c of preview) {
      console.log(`    ${c.nodes.length.toString().padStart(4)} nodes  ${Math.round(c.w)}x${Math.round(c.h)}  ${c.key}`)
    }
    console.log('  --dry-run: no rows written')
    return
  }

  const result = await pool.query(
    `UPDATE janki.graph_nodes AS n
        SET ui = n.ui || jsonb_build_object('x', v.x, 'y', v.y, 'cluster', v.cluster),
            updated_at = now()
       FROM (
         SELECT unnest($1::text[])   AS id,
                unnest($2::float8[]) AS x,
                unnest($3::float8[]) AS y,
                unnest($4::text[])   AS cluster
       ) AS v
      WHERE n.id = v.id AND n.owner_uid = $5`,
    [ids, xs, ys, clusterKeys, ownerUid],
  )
  console.log(`  updated:         ${result.rowCount} rows`)
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL })
  try {
    const rows = ONLY_OWNER
      ? [{ owner_uid: ONLY_OWNER }]
      : (
          await pool.query<{ owner_uid: string }>(
            `SELECT DISTINCT owner_uid FROM janki.graph_nodes ORDER BY owner_uid`,
          )
        ).rows

    if (rows.length === 0) {
      console.log('No graph owners found.')
      return
    }

    for (const { owner_uid } of rows) {
      console.log(`\nowner ${owner_uid}`)
      await layoutOwner(pool, owner_uid)
    }
    console.log(DRY_RUN ? '\nDry run complete.' : '\nLayout written.')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
