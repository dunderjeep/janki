/**
 * GET /api/srs/graph/card/[cardId]/connections
 *
 * Returns the 1st-level RELATED_TO neighbours of a card node.
 * Used by the StudyUI connections panel.
 *
 * Response: { connections: Array<{ edgeId, direction, nodeId, kind, label, srsId, front?, back?, deckId?, name? }> }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsDecks, graphEdges, graphNodes } from '@/db/schema/janki'
import { eq, and, or, inArray } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  // Look up the card's nodeId
  const [card] = await db
    .select({ nodeId: srsCards.nodeId })
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)
  if (!card?.nodeId) return NextResponse.json({ connections: [] })

  const nodeId = card.nodeId

  // Fetch all RELATED_TO edges touching this node
  const edges = await db
    .select()
    .from(graphEdges)
    .where(
      and(
        eq(graphEdges.ownerUid, uid),
        eq(graphEdges.type, 'RELATED_TO'),
        or(eq(graphEdges.fromNodeId, nodeId), eq(graphEdges.toNodeId, nodeId)),
      ),
    )

  if (!edges.length) return NextResponse.json({ connections: [] })

  // Collect all neighbour node ids
  const neighbourIds = [
    ...new Set(
      edges.flatMap((e) => [e.fromNodeId, e.toNodeId]).filter((id) => id !== nodeId),
    ),
  ]

  // Fetch neighbour graph nodes
  const neighbourNodes = await db
    .select()
    .from(graphNodes)
    .where(inArray(graphNodes.id, neighbourIds))
  const nodeMap = Object.fromEntries(neighbourNodes.map((n) => [n.id, n]))

  // Fetch SRS data for neighbour nodes
  const neighbourCards = await db
    .select({ id: srsCards.id, front: srsCards.front, back: srsCards.back, deckId: srsCards.deckId, nodeId: srsCards.nodeId })
    .from(srsCards)
    .where(and(eq(srsCards.ownerUid, uid), inArray(srsCards.nodeId, neighbourIds)))
  const neighbourDecks = await db
    .select({ id: srsDecks.id, name: srsDecks.name, nodeId: srsDecks.nodeId })
    .from(srsDecks)
    .where(and(eq(srsDecks.ownerUid, uid), inArray(srsDecks.nodeId, neighbourIds)))

  const cardByNodeId  = Object.fromEntries(neighbourCards.filter(c => c.nodeId).map((c) => [c.nodeId!, c]))
  const deckByNodeId  = Object.fromEntries(neighbourDecks.filter(d => d.nodeId).map((d) => [d.nodeId!, d]))

  const connections = edges.map((edge) => {
    const direction = edge.fromNodeId === nodeId ? 'outgoing' : 'incoming'
    const nid = direction === 'outgoing' ? edge.toNodeId : edge.fromNodeId
    const gn  = nodeMap[nid]
    const kind = (gn?.props as Record<string, unknown>)?.kind as string | undefined
    const props = edge.props as Record<string, unknown>

    const conn: Record<string, unknown> = {
      edgeId:    edge.id,
      direction,
      nodeId:    nid,
      kind:      kind ?? 'Unknown',
      label:     props.label ?? null,
    }

    if (kind === 'Card') {
      const c = cardByNodeId[nid]
      conn.srsId  = c?.id
      conn.front  = c?.front
      conn.back   = c?.back
      conn.deckId = c?.deckId
    } else if (kind === 'Deck') {
      const d = deckByNodeId[nid]
      conn.srsId  = d?.id
      conn.name   = d?.name
    }

    return conn
  })

  return NextResponse.json({ connections })
}
