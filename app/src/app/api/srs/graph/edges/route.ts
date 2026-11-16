/**
 * POST /api/srs/graph/edges
 *
 * Creates a RELATED_TO edge between two graph nodes (both must belong to this user).
 * Body: { fromNodeId, toNodeId, label? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { graphNodes } from '@/db/schema/janki'
import { eq, and, inArray } from 'drizzle-orm'
import { createEdge } from '@/lib/graphStore'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as { fromNodeId: string; toNodeId: string; label?: string }
  if (!body.fromNodeId || !body.toNodeId) {
    return NextResponse.json({ error: 'fromNodeId and toNodeId required' }, { status: 400 })
  }

  // Verify both nodes belong to this user
  const owned = await db
    .select({ id: graphNodes.id })
    .from(graphNodes)
    .where(and(eq(graphNodes.ownerUid, uid), inArray(graphNodes.id, [body.fromNodeId, body.toNodeId])))
  if (owned.length !== 2) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 })
  }

  const edge = await createEdge(uid, {
    type:       'RELATED_TO',
    fromNodeId: body.fromNodeId,
    toNodeId:   body.toNodeId,
    props:      body.label ? { label: body.label } : {},
  })

  return NextResponse.json({ edge }, { status: 201 })
}
