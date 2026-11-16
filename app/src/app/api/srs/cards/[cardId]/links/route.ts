/**
 * POST /api/srs/cards/[cardId]/links
 *
 * Links two cards with a RELATED_TO graph edge.
 * Creates graph nodes for either card that doesn't have one yet.
 * Does NOT create a bridge/connection card — just the edge.
 *
 * Body: { targetCardId: string, label?: string }
 * Response: { edgeId: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, graphNodes, graphEdges } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createEdge } from '@/lib/graphStore'

async function ensureCardNode(uid: string, card: { id: string; front: string; nodeId: string | null }) {
  if (card.nodeId) return card.nodeId

  const nodeId = nanoid()
  await db.insert(graphNodes).values({
    id: nodeId,
    ownerUid: uid,
    label: card.front.length > 80 ? card.front.slice(0, 77) + '…' : card.front,
    props: { kind: 'Card', srsCardId: card.id },
  })
  await db.update(srsCards)
    .set({ nodeId })
    .where(and(eq(srsCards.id, card.id), eq(srsCards.ownerUid, uid)))

  return nodeId
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  const { targetCardId, label } = await req.json() as { targetCardId: string; label?: string }
  if (!targetCardId) return NextResponse.json({ error: 'targetCardId required' }, { status: 400 })
  if (cardId === targetCardId) return NextResponse.json({ error: 'Cannot link card to itself' }, { status: 400 })

  const [cardA] = await db
    .select({ id: srsCards.id, front: srsCards.front, nodeId: srsCards.nodeId })
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  const [cardB] = await db
    .select({ id: srsCards.id, front: srsCards.front, nodeId: srsCards.nodeId })
    .from(srsCards)
    .where(and(eq(srsCards.id, targetCardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!cardA || !cardB) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  // Check if edge already exists
  const fromNodeId = await ensureCardNode(uid, cardA)
  const toNodeId   = await ensureCardNode(uid, cardB)

  const existing = await db
    .select({ id: graphEdges.id })
    .from(graphEdges)
    .where(
      and(
        eq(graphEdges.ownerUid, uid),
        eq(graphEdges.type, 'RELATED_TO'),
        eq(graphEdges.fromNodeId, fromNodeId),
        eq(graphEdges.toNodeId, toNodeId),
      ),
    )
    .limit(1)

  if (existing[0]) return NextResponse.json({ edgeId: existing[0].id })

  const edge = await createEdge(uid, {
    type: 'RELATED_TO',
    fromNodeId,
    toNodeId,
    props: label ? { label } : {},
  })

  return NextResponse.json({ edgeId: edge.id }, { status: 201 })
}
