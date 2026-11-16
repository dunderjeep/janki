/**
 * GET /api/srs/graph
 *
 * Returns all deck nodes + RELATED_TO deck↔deck edges for the current user.
 * Lazily creates graphNodes for any deck that doesn't have one yet (nodeId sync).
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCardStates, srsCards, graphNodes, graphEdges } from '@/db/schema/janki'
import { eq, and, inArray, or, sql } from 'drizzle-orm'
import { createNode } from '@/lib/graphStore'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  // ── 1. All decks ───────────────────────────────────────────────────────────
  const decks = await db
    .select({ id: srsDecks.id, name: srsDecks.name, nodeId: srsDecks.nodeId, active: srsDecks.active })
    .from(srsDecks)
    .where(eq(srsDecks.ownerUid, uid))
    .orderBy(srsDecks.name)

  // ── 2. Card + due counts per deck ─────────────────────────────────────────
  const counts = await db
    .select({
      deckId: srsCardStates.deckId,
      total:  sql<number>`count(*)`.as('total'),
      due:    sql<number>`count(*) filter (where janki.parse_due_at(${srsCardStates.srs}) <= NOW())`.as('due'),
    })
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .where(eq(srsCardStates.ownerUid, uid))
    .groupBy(srsCardStates.deckId)
  const countMap = Object.fromEntries(counts.map((c) => [c.deckId, c]))

  // ── 3. Sync: create graph nodes for decks that don't have one ─────────────
  const COLS = 5
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i]
    if (deck.nodeId) continue
    const node = await createNode(uid, {
      label: deck.name,
      props: { kind: 'Deck', srsId: deck.id },
      ui:    { x: (i % COLS) * 300 + 60, y: Math.floor(i / COLS) * 180 + 60 },
    })
    await db
      .update(srsDecks)
      .set({ nodeId: node.id, updatedAt: new Date() })
      .where(and(eq(srsDecks.id, deck.id), eq(srsDecks.ownerUid, uid)))
    deck.nodeId = node.id
  }

  // ── 4. Fetch graph nodes ───────────────────────────────────────────────────
  const nodeIds = decks.map((d) => d.nodeId!).filter(Boolean)
  const nodes = nodeIds.length
    ? await db.select().from(graphNodes).where(inArray(graphNodes.id, nodeIds))
    : []

  // ── 5. Fetch RELATED_TO edges between these deck nodes ────────────────────
  const nodeIdSet = new Set(nodeIds)
  const allEdges = nodeIds.length
    ? await db
        .select()
        .from(graphEdges)
        .where(
          and(
            eq(graphEdges.ownerUid, uid),
            eq(graphEdges.type, 'RELATED_TO'),
            or(inArray(graphEdges.fromNodeId, nodeIds), inArray(graphEdges.toNodeId, nodeIds)),
          ),
        )
    : []
  const edges = allEdges.filter((e) => nodeIdSet.has(e.fromNodeId) && nodeIdSet.has(e.toNodeId))

  // ── 6. Build deckByNodeId lookup for the canvas ───────────────────────────
  const deckByNodeId: Record<string, {
    deckId: string; name: string; active: boolean; total: number; due: number
  }> = {}
  for (const deck of decks) {
    if (!deck.nodeId) continue
    const c = countMap[deck.id]
    deckByNodeId[deck.nodeId] = {
      deckId: deck.id, name: deck.name, active: deck.active,
      total:  Number(c?.total ?? 0),
      due:    Number(c?.due   ?? 0),
    }
  }

  return NextResponse.json({ nodes, edges, deckByNodeId })
}
