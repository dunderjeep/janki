import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getNode, updateNode, deleteNode } from '@/lib/graphStore'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const node = await getNode(uid, id)
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ node })
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
    label?: string
    props?: Record<string, unknown>
    ui?: { x: number; y: number }
    occurredAt?: string | null
    validFrom?: string | null
    validTo?: string | null
  }

  const patch: Parameters<typeof updateNode>[2] = {}
  if (body.label !== undefined) patch.label = body.label
  if (body.props !== undefined) patch.props = body.props
  if (body.ui !== undefined) patch.ui = body.ui
  if ('occurredAt' in body) patch.occurredAt = body.occurredAt ? new Date(body.occurredAt) : null
  if ('validFrom' in body) patch.validFrom = body.validFrom ? new Date(body.validFrom) : null
  if ('validTo' in body) patch.validTo = body.validTo ? new Date(body.validTo) : null

  const node = await updateNode(uid, id, patch)
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ node })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const deleted = await deleteNode(uid, id)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
}
