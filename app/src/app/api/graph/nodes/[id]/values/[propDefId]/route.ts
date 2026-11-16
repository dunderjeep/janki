import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { upsertValueEdge, removeValueEdge } from '@/lib/graphStore'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; propDefId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id, propDefId } = await params

  const body = await req.json() as { value: unknown; privacy?: string }

  if (body.value === undefined) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }

  try {
    const edge = await upsertValueEdge(uid, id, propDefId, body.value, body.privacy ?? 'public')
    return NextResponse.json({ edge })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; propDefId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id, propDefId } = await params
  await removeValueEdge(uid, id, propDefId)

  return new NextResponse(null, { status: 204 })
}
