/**
 * GET /api/srs/graph/deck/[deckId]
 *
 * Returns all card nodes in a deck + RELATED_TO edges between them (including
 * cross-deck edges if connected cards live in other decks).
 * Lazily creates graphNodes for any card that doesn't have one yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsDecks, graphNodes, graphEdges } from '@/db/schema/janki'
import { eq, and, inArray, or } from 'drizzle-orm'
import { createNode } from '@/lib/graphStore'

const CARD_CANVAS_LIMIT = 250
const COLS = 8

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { deckId } = await params

  // ── 1. Verify deck ownership ───────────────────────────────────────────────
  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── 2. All cards in deck ───────────────────────────────────────────────────
  const cards = await db
    .select({ id: srsCards.id, front: srsCards.front, back: srsCards.back, nodeId: srsCards.nodeId })
    .from(srsCards)
    .where(and(eq(srsCards.deckId, deckId), eq(srsCards.ownerUid, uid)))
    .orderBy(srsCards.createdAt)
    .limit(CARD_CANVAS_LIMIT)

  const total = await db
    .select({ count: srsCards.id })
    .from(srsCards)
    .where(and(eq(srsCards.deckId, deckId), eq(srsCards.ownerUid, uid)))

  // ── 3. Sync: create graph nodes for cards missing one ─────────────────────
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    if (card.nodeId) continue
    const label = card.front.length > 60 ? card.front.slice(0, 57) + '…' : card.front
    const node = await createNode(uid, {
      label,
      props: { kind: 'Card', srsId: card.id, deckId },
      ui:    { x: (i % COLS) * 220 + 60, y: Math.floor(i / COLS) * 140 + 60 },
    })
    await db
      .update(srsCards)
      .set({ nodeId: node.id, updatedAt: new Date() })
      .where(and(eq(srsCards.id, card.id), eq(srsCards.ownerUid, uid)))
    card.nodeId = node.id
  }

  // ── 4. Fetch graph nodes ───────────────────────────────────────────────────
  const nodeIds = cards.map((c) => c.nodeId!).filter(Boolean)
  const nodes = nodeIds.length
    ? await db.select().from(graphNodes).where(inArray(graphNodes.id, nodeIds))
    : []

  // ── 5. RELATED_TO edges where at least one endpoint is in this deck ────────
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

  // For cross-deck edges, also fetch the foreign card nodes so the canvas can render them
  const foreignNodeIds = [
    ...new Set(
      allEdges
        .flatMap((e) => [e.fromNodeId, e.toNodeId])
        .filter((id) => !nodeIdSet.has(id)),
    ),
  ]
  const foreignNodes = foreignNodeIds.length
    ? await db.select().from(graphNodes).where(inArray(graphNodes.id, foreignNodeIds))
    : []

  // ── 6. Build cardByNodeId lookup ──────────────────────────────────────────
  const cardByNodeId: Record<string, { cardId: string; deckId: string; front: string; back: string }> = {}
  for (const card of cards) {
    if (!card.nodeId) continue
    cardByNodeId[card.nodeId] = {
      cardId: card.id, deckId, front: card.front, back: card.back,
    }
  }
  // Also look up foreign cards so the canvas can show their labels
  if (foreignNodeIds.length) {
    const foreignCards = await db
      .select({ id: srsCards.id, front: srsCards.front, back: srsCards.back, nodeId: srsCards.nodeId, deckId: srsCards.deckId })
      .from(srsCards)
      .where(and(eq(srsCards.ownerUid, uid), inArray(srsCards.nodeId, foreignNodeIds)))
    for (const fc of foreignCards) {
      if (fc.nodeId) {
        cardByNodeId[fc.nodeId] = { cardId: fc.id, deckId: fc.deckId, front: fc.front, back: fc.back }
      }
    }
  }

  return NextResponse.json({
    nodes:       [...nodes, ...foreignNodes],
    edges:       allEdges,
    cardByNodeId,
    deckId,
    deckName:    deck.name,
    totalCards:  total.length,
    truncated:   total.length > CARD_CANVAS_LIMIT,
  })
}
