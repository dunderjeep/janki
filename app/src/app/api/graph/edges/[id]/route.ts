import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getEdge, updateEdge, deleteEdge } from '@/lib/graphStore'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const edge = await getEdge(uid, id)
  if (!edge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ edge })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params

  const body = await req.json() as {
    type?: string
    props?: Record<string, unknown>
    fromPortId?: string | null
    toPortId?: string | null
    occurredAt?: string | null
    validFrom?: string | null
    validTo?: string | null
  }

  const patch: Parameters<typeof updateEdge>[2] = {}
  if (body.type !== undefined) patch.type = body.type
  if (body.props !== undefined) patch.props = body.props
  if (body.fromPortId !== undefined) patch.fromPortId = body.fromPortId
  if (body.toPortId !== undefined) patch.toPortId = body.toPortId
  if ('occurredAt' in body) patch.occurredAt = body.occurredAt ? new Date(body.occurredAt) : null
  if ('validFrom' in body) patch.validFrom = body.validFrom ? new Date(body.validFrom) : null
  if ('validTo' in body) patch.validTo = body.validTo ? new Date(body.validTo) : null

  const edge = await updateEdge(uid, id, patch)
  if (!edge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ edge })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const deleted = await deleteEdge(uid, id)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}
