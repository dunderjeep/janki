import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listEdgeSummaries, createEdge, isValidAt } from '@/lib/graphStore'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const asOfStr = req.nextUrl.searchParams.get('asOf')
  const asOf = asOfStr ? new Date(asOfStr) : null
  const excludeKinds = req.nextUrl.searchParams.get('excludeKinds')?.split(',').filter(Boolean) ?? []

  let edges = await listEdgeSummaries(uid, { excludeKinds })
  if (asOf) edges = edges.filter(e => isValidAt(e, asOf))

  return NextResponse.json({ edges })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    type: string
    fromNodeId: string
    toNodeId: string
    props?: Record<string, unknown>
    graphId?: string
    fromPortId?: string | null
    toPortId?: string | null
    occurredAt?: string | null
    validFrom?: string | null
    validTo?: string | null
  }

  if (!body.type?.trim() || !body.fromNodeId || !body.toNodeId) {
    return NextResponse.json({ error: 'type, fromNodeId, and toNodeId are required' }, { status: 400 })
  }

  const edge = await createEdge(uid, {
    type: body.type,
    fromNodeId: body.fromNodeId,
    toNodeId: body.toNodeId,
    props: body.props,
    graphId: body.graphId,
    fromPortId: body.fromPortId ?? null,
    toPortId: body.toPortId ?? null,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validTo: body.validTo ? new Date(body.validTo) : null,
  })

  return NextResponse.json({ edge }, { status: 201 })
}
