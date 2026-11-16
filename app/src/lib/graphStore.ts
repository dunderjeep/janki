import { db } from '@/db'
import { graphNodes, graphEdges, graphMeta, srsCards, srsDecks, srsReviews } from '@/db/schema/janki'
import { eq, and, inArray, or, ilike, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GraphNode = typeof graphNodes.$inferSelect
export type GraphEdge = typeof graphEdges.$inferSelect

/**
 * Canvas-shaped projections — exactly what the graph view renders, nothing more.
 *
 * Full rows carry the whole payload: Card props alone hold front/back text, tags
 * and four media URLs (~270 kB across the graph) that the canvas never reads.
 * The detail drawer fetches the complete node by id when one is selected.
 */
export type GraphNodeSummary = {
  id: string
  label: string
  kind: string | null
  ui: unknown
  validFrom: Date | null
  validTo: Date | null
}

export type GraphEdgeSummary = {
  id: string
  type: string
  fromNodeId: string
  toNodeId: string
  fromPortId: string | null
  toPortId: string | null
  validFrom: Date | null
  validTo: Date | null
}

const nodeSummaryCols = {
  id: graphNodes.id,
  label: graphNodes.label,
  kind: sql<string | null>`${graphNodes.props}->>'kind'`,
  ui: graphNodes.ui,
  validFrom: graphNodes.validFrom,
  validTo: graphNodes.validTo,
}

const edgeSummaryCols = {
  id: graphEdges.id,
  type: graphEdges.type,
  fromNodeId: graphEdges.fromNodeId,
  toNodeId: graphEdges.toNodeId,
  fromPortId: graphEdges.fromPortId,
  toPortId: graphEdges.toPortId,
  validFrom: graphEdges.validFrom,
  validTo: graphEdges.validTo,
}

export type NodeUpsertInput = {
  id?: string
  graphId?: string
  label: string
  props?: Record<string, unknown>
  ui?: { x: number; y: number }
  occurredAt?: Date | null
  validFrom?: Date | null
  validTo?: Date | null
}

export type EdgeUpsertInput = {
  id?: string
  graphId?: string
  type: string
  fromNodeId: string
  toNodeId: string
  props?: Record<string, unknown>
  fromPortId?: string | null
  toPortId?: string | null
  occurredAt?: Date | null
  validFrom?: Date | null
  validTo?: Date | null
}

export type ValueType = 'String' | 'Number' | 'Boolean' | 'Date' | 'Email' | 'PhoneE164'

export type PropertyDef = {
  nodeId: string
  label: string
  key: string
  valueType: ValueType
  unit: string | null
  cardinality: string
  description: string
  constraints?: {
    min?: number
    max?: number
    enum?: string[]
    pattern?: string
  }
  privacyDefault: 'public' | 'private' | 'sensitive'
}

export type ValueEdge = {
  edgeId: string
  propDefId: string
  value: string | number | boolean | null
  valueType: string
  unit: string | null
  privacy: string
}

// ── Temporal helpers ──────────────────────────────────────────────────────────

export function isValidAt(
  node: { validFrom?: Date | null; validTo?: Date | null },
  asOf: Date
): boolean {
  if (node.validFrom && node.validFrom > asOf) return false
  if (node.validTo && node.validTo <= asOf) return false
  return true
}

export function isOccurredInRange(
  node: { occurredAt?: Date | null },
  start: Date,
  end: Date
): boolean {
  if (!node.occurredAt) return false
  return node.occurredAt >= start && node.occurredAt < end
}

// ── CRUD — Nodes ──────────────────────────────────────────────────────────────

/**
 * Per-cluster summary for the canvas's cluster frames.
 *
 * `srsCardCount` is what the deck actually holds in the SRS tables, which is
 * often more than `cardCount` — the graph is a partial mirror (718 of 3178
 * cards), so 42 decks appear empty in the graph while holding real cards.
 * Surfacing both keeps the frame honest instead of implying the deck is empty.
 */
export type ClusterStats = {
  clusterKey: string
  label: string
  deckNodeId: string | null
  nodeCount: number
  cardCount: number
  topicCount: number
  srsCardCount: number | null
  topTopics: string[]
  minX: number
  minY: number
  maxX: number
  maxY: number
  /** Bounding circle, matching how layout-graph.ts packs clusters. */
  centerX: number
  centerY: number
  radius: number
}

export async function getClusterStats(ownerUid: string): Promise<ClusterStats[]> {
  const { rows } = await db.execute<{
    cluster_key: string
    deck_node_id: string | null
    deck_label: string | null
    node_count: string
    card_count: string
    topic_count: string
    srs_card_count: string | null
    top_topics: string[] | null
    min_x: number
    min_y: number
    max_x: number
    max_y: number
    center_x: number
    center_y: number
    radius: number | null
  }>(sql`
    WITH n AS (
      SELECT
        ${graphNodes.ui}->>'cluster'                        AS cluster_key,
        ${graphNodes.id}                                    AS id,
        ${graphNodes.label}                                 AS label,
        ${graphNodes.props}->>'kind'                        AS kind,
        ${graphNodes.props}->>'srsId'                       AS srs_id,
        (${graphNodes.ui}->>'x')::float8                    AS x,
        (${graphNodes.ui}->>'y')::float8                    AS y
      FROM ${graphNodes}
      WHERE ${graphNodes.ownerUid} = ${ownerUid}
        AND ${graphNodes.ui} ? 'cluster'
    ),
    deg AS (
      SELECT node_id, count(*) AS d FROM (
        SELECT ${graphEdges.fromNodeId} AS node_id FROM ${graphEdges}
          WHERE ${graphEdges.ownerUid} = ${ownerUid}
        UNION ALL
        SELECT ${graphEdges.toNodeId} FROM ${graphEdges}
          WHERE ${graphEdges.ownerUid} = ${ownerUid}
      ) e GROUP BY node_id
    ),
    -- The cluster key IS the deck's id: scripts/layout-graph.ts groups a deck's
    -- cards under the deck node's own id. Resolving the name by that key rather
    -- than by looking for a Deck node *inside* the cluster is what stops 18 of
    -- 19 real decks rendering as "Untitled" — their Deck nodes were laid out
    -- before clustering and so carry no ui.cluster of their own.
    deck AS (
      SELECT DISTINCT n.cluster_key,
             gn.id                                          AS id,
             coalesce(sd.name, gn.label)                     AS label,
             coalesce(gn.props->>'srsId', sd.id)             AS srs_id
      FROM n
      LEFT JOIN ${graphNodes} gn
        ON gn.id = n.cluster_key AND gn.owner_uid = ${ownerUid}
      LEFT JOIN ${srsDecks} sd
        ON sd.id = n.cluster_key AND sd.owner_uid = ${ownerUid}
      WHERE gn.id IS NOT NULL OR sd.id IS NOT NULL
    ),
    bounds AS (
      SELECT cluster_key,
             (min(x) + max(x)) / 2 AS cx,
             (min(y) + max(y)) / 2 AS cy
      FROM n GROUP BY cluster_key
    ),
    circle AS (
      -- Radius measured from the bbox centre, matching boundingRadius() in
      -- scripts/layout-graph.ts so frames line up with how clusters were packed.
      SELECT n.cluster_key,
             max(sqrt((n.x - b.cx) ^ 2 + (n.y - b.cy) ^ 2)) AS rad
      FROM n JOIN bounds b ON b.cluster_key = n.cluster_key
      GROUP BY n.cluster_key
    ),
    topics AS (
      SELECT cluster_key, array_agg(label ORDER BY d DESC NULLS LAST, label) AS labels
      FROM (
        SELECT n.cluster_key, n.label, deg.d,
               row_number() OVER (PARTITION BY n.cluster_key ORDER BY deg.d DESC NULLS LAST, n.label) AS rn
        FROM n LEFT JOIN deg ON deg.node_id = n.id
        WHERE n.kind = 'Topic'
      ) t WHERE rn <= 3 GROUP BY cluster_key
    )
    SELECT
      n.cluster_key,
      deck.id                                              AS deck_node_id,
      deck.label                                           AS deck_label,
      count(*)                                             AS node_count,
      count(*) FILTER (WHERE n.kind = 'Card')              AS card_count,
      count(*) FILTER (WHERE n.kind = 'Topic')             AS topic_count,
      (SELECT count(*) FROM ${srsCards} sc WHERE sc.deck_id = deck.srs_id) AS srs_card_count,
      topics.labels                                        AS top_topics,
      min(n.x) AS min_x, min(n.y) AS min_y,
      max(n.x) AS max_x, max(n.y) AS max_y,
      (min(n.x) + max(n.x)) / 2                            AS center_x,
      (min(n.y) + max(n.y)) / 2                            AS center_y,
      circle.rad                                           AS radius
    FROM n
    LEFT JOIN deck   ON deck.cluster_key   = n.cluster_key
    LEFT JOIN topics ON topics.cluster_key = n.cluster_key
    LEFT JOIN circle ON circle.cluster_key = n.cluster_key
    GROUP BY n.cluster_key, deck.id, deck.label, deck.srs_id, topics.labels, circle.rad
    ORDER BY count(*) DESC
  `)

  return rows.map(r => ({
    clusterKey: r.cluster_key,
    label: r.deck_label ?? (r.cluster_key === '__loose' ? 'Unfiled' : r.cluster_key === '__schema' ? 'Schema' : 'Untitled'),
    deckNodeId: r.deck_node_id,
    nodeCount: Number(r.node_count),
    cardCount: Number(r.card_count),
    topicCount: Number(r.topic_count),
    srsCardCount: r.srs_card_count === null ? null : Number(r.srs_card_count),
    // Distinct topic nodes can share a label (two "CEFR A1 French" topics exist).
    topTopics: [...new Set(r.top_topics ?? [])],
    minX: r.min_x, minY: r.min_y, maxX: r.max_x, maxY: r.max_y,
    centerX: r.center_x, centerY: r.center_y,
    // A single-node cluster has radius 0 — give it something drawable.
    radius: Math.max(Number(r.radius ?? 0), 40),
  }))
}

/**
 * Per-card study history, keyed by graph node id.
 *
 * Read from srs_reviews rather than from srs_card_states.srs: the FSRS state is
 * the *current* scheduler position and gets wiped by the deck/topic reset
 * endpoints, which leaves 3518 of 3560 cards reading "new" while the review log
 * still holds 16k graded answers. The log is the durable record of how a card
 * has actually gone.
 *
 * `ease` maps the four grades onto 0..1. The gaps are uneven on purpose — the
 * distance from "again" to "hard" is a bigger admission than "good" to "easy".
 */
export type CardMastery = {
  id: string
  /** 0 = always struggled, 1 = always easy. Null when never graded. */
  ease: number | null
  reps: number
  lastReviewedAt: Date | null
}

export async function getCardMastery(ownerUid: string): Promise<CardMastery[]> {
  const { rows } = await db.execute<{
    id: string
    ease: string | null
    reps: string
    last_reviewed_at: Date | null
  }>(sql`
    SELECT n.id                                        AS id,
           avg(CASE ${srsReviews.grade}
                 WHEN 'again' THEN 0.0
                 WHEN 'hard'  THEN 0.34
                 WHEN 'good'  THEN 0.75
                 WHEN 'easy'  THEN 1.0
               END)                                    AS ease,
           count(*)                                    AS reps,
           max(${srsReviews.reviewedAt})               AS last_reviewed_at
    FROM ${graphNodes} n
    JOIN ${srsReviews}
      ON ${srsReviews.cardId} = n.id
     AND ${srsReviews.ownerUid} = ${ownerUid}
    WHERE n.owner_uid = ${ownerUid}
      AND n.props->>'kind' = 'Card'
    GROUP BY n.id
  `)

  return rows.map(r => ({
    id: r.id,
    ease: r.ease === null ? null : Number(r.ease),
    reps: Number(r.reps),
    lastReviewedAt: r.last_reviewed_at,
  }))
}

/** Node projection for the canvas — see GraphNodeSummary. */
export async function listNodeSummaries(
  ownerUid: string,
  opts: { limit?: number; excludeKinds?: string[] } = {}
): Promise<GraphNodeSummary[]> {
  // Projections are ~150 bytes a row, so the cap is a guard rail rather than a
  // budget — it must sit above the real graph size or the overview silently
  // drops nodes (the old 1200 cut 41 of 1241).
  const { limit = 5000, excludeKinds = [] } = opts
  const conds = [eq(graphNodes.ownerUid, ownerUid)]
  if (excludeKinds.length > 0) {
    conds.push(
      or(
        sql`${graphNodes.props}->>'kind' IS NULL`,
        sql`${graphNodes.props}->>'kind' NOT IN (${sql.join(excludeKinds.map(k => sql`${k}`), sql`, `)})`,
      )!
    )
  }
  return db.select(nodeSummaryCols).from(graphNodes).where(and(...conds)).limit(limit)
}

export async function getNode(ownerUid: string, id: string): Promise<GraphNode | null> {
  const rows = await db.select().from(graphNodes)
    .where(and(eq(graphNodes.id, id), eq(graphNodes.ownerUid, ownerUid)))
    .limit(1)
  return rows[0] ?? null
}

export async function createNode(ownerUid: string, input: NodeUpsertInput): Promise<GraphNode> {
  const rows = await db.insert(graphNodes).values({
    id: input.id ?? nanoid(),
    graphId: input.graphId ?? 'default',
    ownerUid,
    label: input.label,
    props: (input.props ?? {}) as Record<string, unknown>,
    ui: (input.ui ?? {}) as Record<string, unknown>,
    occurredAt: input.occurredAt ?? null,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
  }).returning()
  return rows[0]
}

export async function updateNode(
  ownerUid: string,
  id: string,
  patch: Partial<NodeUpsertInput>
): Promise<GraphNode | null> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.label !== undefined) updateData.label = patch.label
  if (patch.props !== undefined) updateData.props = patch.props
  if (patch.ui !== undefined) updateData.ui = patch.ui
  if ('occurredAt' in patch) updateData.occurredAt = patch.occurredAt
  if ('validFrom' in patch) updateData.validFrom = patch.validFrom
  if ('validTo' in patch) updateData.validTo = patch.validTo
  const rows = await db.update(graphNodes)
    .set(updateData)
    .where(and(eq(graphNodes.id, id), eq(graphNodes.ownerUid, ownerUid)))
    .returning()
  return rows[0] ?? null
}

export async function deleteNode(ownerUid: string, id: string): Promise<boolean> {
  // graph_edges has ON DELETE CASCADE on both from/to FKs, so edges auto-delete
  const rows = await db.delete(graphNodes)
    .where(and(eq(graphNodes.id, id), eq(graphNodes.ownerUid, ownerUid)))
    .returning({ id: graphNodes.id })
  return rows.length > 0
}

// ── CRUD — Edges ──────────────────────────────────────────────────────────────

/** Edge projection for the canvas — see GraphEdgeSummary. */
export async function listEdgeSummaries(
  ownerUid: string,
  opts: { limit?: number; excludeKinds?: string[] } = {}
): Promise<GraphEdgeSummary[]> {
  const { limit = 12000, excludeKinds = [] } = opts
  if (excludeKinds.length === 0) {
    return db.select(edgeSummaryCols).from(graphEdges)
      .where(eq(graphEdges.ownerUid, ownerUid))
      .limit(limit)
  }
  const allowedNodes = db.select({ id: graphNodes.id }).from(graphNodes)
    .where(and(
      eq(graphNodes.ownerUid, ownerUid),
      or(
        sql`${graphNodes.props}->>'kind' IS NULL`,
        sql`${graphNodes.props}->>'kind' NOT IN (${sql.join(excludeKinds.map(k => sql`${k}`), sql`, `)})`,
      )
    ))
  return db.select(edgeSummaryCols).from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      inArray(graphEdges.fromNodeId, allowedNodes),
      inArray(graphEdges.toNodeId, allowedNodes),
    ))
    .limit(limit)
}

export async function getEdge(ownerUid: string, id: string): Promise<GraphEdge | null> {
  const rows = await db.select().from(graphEdges)
    .where(and(eq(graphEdges.id, id), eq(graphEdges.ownerUid, ownerUid)))
    .limit(1)
  return rows[0] ?? null
}

export async function createEdge(ownerUid: string, input: EdgeUpsertInput): Promise<GraphEdge> {
  const rows = await db.insert(graphEdges).values({
    id: input.id ?? nanoid(),
    graphId: input.graphId ?? 'default',
    ownerUid,
    type: input.type,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    props: (input.props ?? {}) as Record<string, unknown>,
    fromPortId: input.fromPortId ?? null,
    toPortId: input.toPortId ?? null,
    occurredAt: input.occurredAt ?? null,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
  }).returning()
  return rows[0]
}

export async function updateEdge(
  ownerUid: string,
  id: string,
  patch: Partial<EdgeUpsertInput>
): Promise<GraphEdge | null> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.type !== undefined) updateData.type = patch.type
  if (patch.props !== undefined) updateData.props = patch.props
  if (patch.fromPortId !== undefined) updateData.fromPortId = patch.fromPortId
  if (patch.toPortId !== undefined) updateData.toPortId = patch.toPortId
  if ('occurredAt' in patch) updateData.occurredAt = patch.occurredAt
  if ('validFrom' in patch) updateData.validFrom = patch.validFrom
  if ('validTo' in patch) updateData.validTo = patch.validTo
  const rows = await db.update(graphEdges)
    .set(updateData)
    .where(and(eq(graphEdges.id, id), eq(graphEdges.ownerUid, ownerUid)))
    .returning()
  return rows[0] ?? null
}

export async function deleteEdge(ownerUid: string, id: string): Promise<boolean> {
  const rows = await db.delete(graphEdges)
    .where(and(eq(graphEdges.id, id), eq(graphEdges.ownerUid, ownerUid)))
    .returning({ id: graphEdges.id })
  return rows.length > 0
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchNodesByLabel(
  ownerUid: string,
  q: string,
  limit = 250
): Promise<GraphNode[]> {
  return db.select().from(graphNodes)
    .where(and(eq(graphNodes.ownerUid, ownerUid), ilike(graphNodes.label, `%${q}%`)))
    .limit(limit)
}

// ── Neighborhood BFS ──────────────────────────────────────────────────────────

/**
 * Breadth-first expansion around a root node, returning canvas projections.
 *
 * `maxNodes` stops a hub node from pulling the whole graph back at depth 2 —
 * expansion halts once the budget is hit and `truncated` is set so the UI can
 * say so rather than silently showing a partial neighbourhood.
 */
export async function getNeighborhood(
  ownerUid: string,
  rootNodeId: string,
  depth = 1,
  edgeTypeFilter?: string,
  maxNodes = 400
): Promise<{ nodes: GraphNodeSummary[]; edges: GraphEdgeSummary[]; truncated: boolean }> {
  const visitedNodeIds = new Set<string>([rootNodeId])
  const visitedEdgeIds = new Set<string>()
  const resultEdges: GraphEdgeSummary[] = []
  let truncated = false

  let frontier = [rootNodeId]
  for (let d = 0; d < depth; d++) {
    if (frontier.length === 0 || truncated) break
    const edgeRows = await db.select(edgeSummaryCols).from(graphEdges)
      .where(and(
        eq(graphEdges.ownerUid, ownerUid),
        or(inArray(graphEdges.fromNodeId, frontier), inArray(graphEdges.toNodeId, frontier)),
        edgeTypeFilter ? eq(graphEdges.type, edgeTypeFilter) : undefined,
      ))
    const nextFrontier: string[] = []
    for (const edge of edgeRows) {
      if (!visitedEdgeIds.has(edge.id)) {
        visitedEdgeIds.add(edge.id)
        resultEdges.push(edge)
      }
      for (const nid of [edge.fromNodeId, edge.toNodeId]) {
        if (visitedNodeIds.has(nid)) continue
        if (visitedNodeIds.size >= maxNodes) {
          truncated = true
          continue
        }
        visitedNodeIds.add(nid)
        nextFrontier.push(nid)
      }
    }
    frontier = nextFrontier
  }

  const nodeIds = [...visitedNodeIds]
  const resultNodes = nodeIds.length > 0
    ? await db.select(nodeSummaryCols).from(graphNodes)
        .where(and(inArray(graphNodes.id, nodeIds), eq(graphNodes.ownerUid, ownerUid)))
    : []

  // Drop edges whose far endpoint was cut by the budget.
  const keptIds = new Set(resultNodes.map(n => n.id))
  const keptEdges = truncated
    ? resultEdges.filter(e => keptIds.has(e.fromNodeId) && keptIds.has(e.toNodeId))
    : resultEdges

  return { nodes: resultNodes, edges: keptEdges, truncated }
}

// ── Type System ───────────────────────────────────────────────────────────────

async function edgesOfType(
  ownerUid: string,
  fromNodeId: string,
  type: string
): Promise<GraphEdge[]> {
  return db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, fromNodeId),
      eq(graphEdges.type, type)
    ))
}

export async function getTypesForNode(
  ownerUid: string,
  entityNodeId: string
): Promise<GraphNode[]> {
  const hasTypeEdges = await edgesOfType(ownerUid, entityNodeId, 'HAS_TYPE')
  if (hasTypeEdges.length === 0) return []
  const typeNodeIds = hasTypeEdges.map(e => e.toNodeId)
  return db.select().from(graphNodes)
    .where(and(inArray(graphNodes.id, typeNodeIds), eq(graphNodes.ownerUid, ownerUid)))
}

export async function getTypeAncestry(ownerUid: string): Promise<Map<string, string[]>> {
  // Returns map: typeNodeId → array of ancestor typeNodeIds (via IS_A chain)
  const isAEdges = await db.select().from(graphEdges)
    .where(and(eq(graphEdges.ownerUid, ownerUid), eq(graphEdges.type, 'IS_A')))
  const parentMap = new Map<string, string>()
  for (const e of isAEdges) parentMap.set(e.fromNodeId, e.toNodeId)

  const result = new Map<string, string[]>()
  const allTypeIds = [...new Set([...parentMap.keys(), ...parentMap.values()])]
  for (const id of allTypeIds) {
    const ancestors: string[] = []
    let cur = parentMap.get(id)
    while (cur) {
      ancestors.push(cur)
      cur = parentMap.get(cur)
    }
    result.set(id, ancestors)
  }
  return result
}

export async function getTypeClosure(
  ownerUid: string,
  typeNodeIds: string[]
): Promise<string[]> {
  const ancestry = await getTypeAncestry(ownerUid)
  const closure = new Set(typeNodeIds)
  for (const id of typeNodeIds) {
    const ancestors = ancestry.get(id) ?? []
    for (const a of ancestors) closure.add(a)
  }
  return [...closure]
}

export async function getInheritedPropertyDefs(
  ownerUid: string,
  entityNodeId: string
): Promise<PropertyDef[]> {
  // 1. get direct types
  const typeNodes = await getTypesForNode(ownerUid, entityNodeId)
  if (typeNodes.length === 0) return []
  // 2. expand to full type closure
  const allTypeIds = await getTypeClosure(ownerUid, typeNodes.map(n => n.id))
  // 3. find HAS_PROPERTY edges from all those type nodes
  const hasPropEdges = await db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      inArray(graphEdges.fromNodeId, allTypeIds),
      eq(graphEdges.type, 'HAS_PROPERTY')
    ))
  if (hasPropEdges.length === 0) return []
  const propDefIds = [...new Set(hasPropEdges.map(e => e.toNodeId))]
  const propNodes = await db.select().from(graphNodes)
    .where(and(inArray(graphNodes.id, propDefIds), eq(graphNodes.ownerUid, ownerUid)))
  return propNodes.map(n => {
    const p = n.props as Record<string, unknown>
    return {
      nodeId: n.id,
      label: n.label,
      key: p.key as string,
      valueType: p.valueType as ValueType,
      unit: (p.unit as string) ?? null,
      cardinality: (p.cardinality as string) ?? '0..1',
      description: (p.description as string) ?? '',
      constraints: p.constraints as PropertyDef['constraints'],
      privacyDefault: (p.privacyDefault as PropertyDef['privacyDefault']) ?? 'public',
    }
  })
}

export async function addHasTypeEdge(
  ownerUid: string,
  entityNodeId: string,
  typeNodeId: string
): Promise<GraphEdge> {
  // Check not already connected
  const existing = await db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, entityNodeId),
      eq(graphEdges.toNodeId, typeNodeId),
      eq(graphEdges.type, 'HAS_TYPE')
    )).limit(1)
  if (existing[0]) return existing[0]
  return createEdge(ownerUid, { type: 'HAS_TYPE', fromNodeId: entityNodeId, toNodeId: typeNodeId })
}

// ── Value System ──────────────────────────────────────────────────────────────

function validateValue(
  value: unknown,
  valueType: ValueType,
  constraints?: PropertyDef['constraints']
): string | null {
  if (value === null || value === undefined) return null
  switch (valueType) {
    case 'String':
      if (typeof value !== 'string') return 'Expected string'
      if (constraints?.enum && !constraints.enum.includes(value)) return `Must be one of: ${constraints.enum.join(', ')}`
      if (constraints?.pattern && !new RegExp(constraints.pattern).test(value)) return 'Does not match pattern'
      break
    case 'Number':
      if (typeof value !== 'number') return 'Expected number'
      if (constraints?.min !== undefined && value < constraints.min) return `Min is ${constraints.min}`
      if (constraints?.max !== undefined && value > constraints.max) return `Max is ${constraints.max}`
      break
    case 'Boolean':
      if (typeof value !== 'boolean') return 'Expected boolean'
      break
    case 'Date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Expected YYYY-MM-DD'
      break
    case 'Email':
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email'
      break
    case 'PhoneE164':
      if (typeof value !== 'string' || !/^\+[1-9]\d{7,15}$/.test(value)) return 'Expected E.164 format (+1234567890)'
      break
  }
  return null
}

export async function getValuesForEntity(
  ownerUid: string,
  entityNodeId: string
): Promise<Record<string, ValueEdge>> {
  const edges = await db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, entityNodeId),
      eq(graphEdges.type, 'HAS_VALUE')
    ))
  const result: Record<string, ValueEdge> = {}
  for (const edge of edges) {
    const p = edge.props as Record<string, unknown>
    const propDefId = edge.toNodeId
    result[propDefId] = {
      edgeId: edge.id,
      propDefId,
      value: p.value as ValueEdge['value'],
      valueType: p.valueType as string,
      unit: (p.unit as string) ?? null,
      privacy: (p.privacy as string) ?? 'public',
    }
  }
  return result
}

export async function upsertValueEdge(
  ownerUid: string,
  entityNodeId: string,
  propDefId: string,
  value: unknown,
  privacy = 'public'
): Promise<GraphEdge> {
  // Find property def to get valueType/unit/constraints
  const propNode = await getNode(ownerUid, propDefId)
  if (!propNode) throw new Error('Property definition not found')
  const p = propNode.props as Record<string, unknown>
  const valueType = p.valueType as ValueType
  const unit = (p.unit as string) ?? null
  const constraints = p.constraints as PropertyDef['constraints']

  const err = validateValue(value, valueType, constraints)
  if (err) throw new Error(`Validation error for ${p.key}: ${err}`)

  const edgeProps = { value, valueType, unit, privacy, updatedAt: new Date().toISOString() }

  // Check for existing HAS_VALUE edge from entity to this prop def
  const existing = await db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, entityNodeId),
      eq(graphEdges.toNodeId, propDefId),
      eq(graphEdges.type, 'HAS_VALUE')
    )).limit(1)

  if (existing[0]) {
    const updated = await updateEdge(ownerUid, existing[0].id, { props: edgeProps })
    return updated!
  }
  return createEdge(ownerUid, {
    type: 'HAS_VALUE',
    fromNodeId: entityNodeId,
    toNodeId: propDefId,
    props: edgeProps,
  })
}

export async function removeValueEdge(
  ownerUid: string,
  entityNodeId: string,
  propDefId: string
): Promise<boolean> {
  const rows = await db.delete(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, entityNodeId),
      eq(graphEdges.toNodeId, propDefId),
      eq(graphEdges.type, 'HAS_VALUE')
    ))
    .returning({ id: graphEdges.id })
  return rows.length > 0
}

// ── Location Edges ────────────────────────────────────────────────────────────

const LOCATION_EDGE_TYPES = ['LIVES_AT', 'WORKS_AT', 'STUDIES_AT', 'VISITS', 'LOCATED_AT'] as const
type LocationEdgeType = typeof LOCATION_EDGE_TYPES[number]

export async function findPlaceNodeByPlaceId(
  ownerUid: string,
  placeId: string
): Promise<GraphNode | null> {
  const rows = await db.select().from(graphNodes)
    .where(and(
      eq(graphNodes.ownerUid, ownerUid),
      sql`${graphNodes.props}->>'placeId' = ${placeId}`,
      sql`${graphNodes.props}->>'kind' = 'Place'`
    )).limit(1)
  return rows[0] ?? null
}

export async function createPlaceNode(
  ownerUid: string,
  place: {
    placeId: string
    name: string
    formattedAddress: string
    lat: number
    lng: number
    googleTypes: string[]
  }
): Promise<GraphNode> {
  return createNode(ownerUid, {
    label: place.name,
    props: { kind: 'Place', ...place },
    ui: { x: 0, y: 0 },
  })
}

export async function addLocationEdge(
  ownerUid: string,
  subjectNodeId: string,
  placeNodeId: string,
  edgeType: LocationEdgeType,
  meta: { validFrom?: string; validTo?: string; notes?: string } = {}
): Promise<GraphEdge> {
  return createEdge(ownerUid, {
    type: edgeType,
    fromNodeId: subjectNodeId,
    toNodeId: placeNodeId,
    props: meta,
    validFrom: meta.validFrom ? new Date(meta.validFrom) : null,
    validTo: meta.validTo ? new Date(meta.validTo) : null,
  })
}

export async function listLocationEdgesForSubject(
  ownerUid: string,
  subjectNodeId: string
): Promise<GraphEdge[]> {
  return db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.fromNodeId, subjectNodeId),
      inArray(graphEdges.type, [...LOCATION_EDGE_TYPES])
    ))
}

export async function listIncomingLocationEdgesForPlace(
  ownerUid: string,
  placeNodeId: string
): Promise<GraphEdge[]> {
  return db.select().from(graphEdges)
    .where(and(
      eq(graphEdges.ownerUid, ownerUid),
      eq(graphEdges.toNodeId, placeNodeId),
      inArray(graphEdges.type, [...LOCATION_EDGE_TYPES])
    ))
}

// ── Meta (graph_meta key-value store) ─────────────────────────────────────────

export async function getMeta(ownerUid: string, key: string): Promise<unknown | null> {
  const rows = await db.select().from(graphMeta)
    .where(and(eq(graphMeta.ownerUid, ownerUid), eq(graphMeta.key, key)))
    .limit(1)
  return rows[0]?.value ?? null
}

export async function setMeta(ownerUid: string, key: string, value: unknown): Promise<void> {
  await db.insert(graphMeta)
    .values({ ownerUid, key, value: value as Record<string, unknown> })
    .onConflictDoUpdate({
      target: [graphMeta.ownerUid, graphMeta.key],
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    })
}

export async function getAllMeta(ownerUid: string): Promise<Record<string, unknown>> {
  const rows = await db.select().from(graphMeta).where(eq(graphMeta.ownerUid, ownerUid))
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ── Base Schema Seed ──────────────────────────────────────────────────────────

export async function ensureBaseSchema(ownerUid: string): Promise<void> {
  const already = await getMeta(ownerUid, 'baseTypesCreated')
  if (already) return

  // Helper to create a node and return its id
  const n = async (label: string, props: Record<string, unknown>): Promise<string> => {
    const node = await createNode(ownerUid, { label, props, ui: { x: 0, y: 0 } })
    return node.id
  }
  const e = (type: string, fromNodeId: string, toNodeId: string) =>
    createEdge(ownerUid, { type, fromNodeId, toNodeId })

  // Type nodes
  const objId = await n('Object', { kind: 'Type' })
  const aniId = await n('Animal', { kind: 'Type' })
  const mamId = await n('Mammal', { kind: 'Type' })
  const perId = await n('Person', { kind: 'Type' })
  await n('Place', { kind: 'Type', isMetaType: true })

  // Type hierarchy edges
  await e('IS_A', aniId, objId)  // Animal IS_A Object
  await e('IS_A', mamId, aniId)  // Mammal IS_A Animal
  await e('IS_A', perId, mamId)  // Person IS_A Mammal

  // Property nodes
  const massId  = await n('massKg',      { kind: 'Property', key: 'massKg',      valueType: 'Number',    unit: 'kg', cardinality: '0..1', description: 'Mass in kilograms',    privacyDefault: 'private' })
  const warmId  = await n('warmBlooded', { kind: 'Property', key: 'warmBlooded', valueType: 'Boolean',   unit: null, cardinality: '0..1', description: 'Warm-blooded animal',   privacyDefault: 'public' })
  const liveId  = await n('liveBirth',   { kind: 'Property', key: 'liveBirth',   valueType: 'Boolean',   unit: null, cardinality: '0..1', description: 'Gives live birth',      privacyDefault: 'public' })
  const birthId = await n('birthdate',   { kind: 'Property', key: 'birthdate',   valueType: 'Date',      unit: null, cardinality: '0..1', description: 'Date of birth',         privacyDefault: 'sensitive' })
  const emailId = await n('email',       { kind: 'Property', key: 'email',       valueType: 'Email',     unit: null, cardinality: '0..N', description: 'Email address',         privacyDefault: 'sensitive' })
  const phoneId = await n('phone',       { kind: 'Property', key: 'phone',       valueType: 'PhoneE164', unit: null, cardinality: '0..N', description: 'Phone in E.164 format', privacyDefault: 'sensitive' })

  // Property edges
  await e('HAS_PROPERTY', objId, massId)
  await e('HAS_PROPERTY', mamId, warmId)
  await e('HAS_PROPERTY', mamId, liveId)
  await e('HAS_PROPERTY', perId, birthId)
  await e('HAS_PROPERTY', perId, emailId)
  await e('HAS_PROPERTY', perId, phoneId)

  // Mark as seeded
  await setMeta(ownerUid, 'baseTypesCreated', { seededAt: new Date().toISOString() })
}
