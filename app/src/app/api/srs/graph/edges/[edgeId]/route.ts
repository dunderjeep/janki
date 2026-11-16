/**
 * DELETE /api/srs/graph/edges/[edgeId]
 * PATCH  /api/srs/graph/edges/[edgeId]   — update label
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { deleteEdge, updateEdge } from '@/lib/graphStore'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ edgeId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { edgeId } = await params

  const ok = await deleteEdge(uid, edgeId)
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ edgeId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { edgeId } = await params

  const { label } = await req.json() as { label?: string }
  const edge = await updateEdge(uid, edgeId, { props: { label: label ?? '' } })
  return edge
    ? NextResponse.json({ edge })
    : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
