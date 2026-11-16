/**
 * DELETE /api/srs/cards/[cardId]/links/[edgeId]
 *
 * Removes a RELATED_TO edge. Ownership verified via ownerUid.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { graphEdges } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string; edgeId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { edgeId } = await params

  await db.delete(graphEdges)
    .where(and(eq(graphEdges.id, edgeId), eq(graphEdges.ownerUid, uid)))

  return NextResponse.json({ ok: true })
}
