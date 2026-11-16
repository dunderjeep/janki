import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listNodeSummaries, createNode, ensureBaseSchema, isValidAt } from '@/lib/graphStore'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  await ensureBaseSchema(uid)

  const asOfStr = req.nextUrl.searchParams.get('asOf')
  const asOf = asOfStr ? new Date(asOfStr) : null
  const excludeKinds = req.nextUrl.searchParams.get('excludeKinds')?.split(',').filter(Boolean) ?? []

  let nodes = await listNodeSummaries(uid, { excludeKinds })
  if (asOf) nodes = nodes.filter(n => isValidAt(n, asOf))

  return NextResponse.json({ nodes })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    label: string
    props?: Record<string, unknown>
    ui?: { x: number; y: number }
    graphId?: string
    occurredAt?: string | null
    validFrom?: string | null
    validTo?: string | null
  }

  if (!body.label?.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }

  const node = await createNode(uid, {
    label: body.label,
    props: body.props,
    ui: body.ui,
    graphId: body.graphId,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
    validFrom: body.validFrom ? new Date(body.validFrom) : null,
    validTo: body.validTo ? new Date(body.validTo) : null,
  })

  return NextResponse.json({ node }, { status: 201 })
}
