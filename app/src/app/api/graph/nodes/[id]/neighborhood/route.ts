import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getNeighborhood } from '@/lib/graphStore'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const depthParam = parseInt(req.nextUrl.searchParams.get('depth') ?? '1', 10)
  const depth = Number.isFinite(depthParam) ? Math.min(Math.max(depthParam, 1), 4) : 1
  const edgeType = req.nextUrl.searchParams.get('edgeType') ?? undefined
  const maxParam = parseInt(req.nextUrl.searchParams.get('maxNodes') ?? '', 10)
  const maxNodes = Number.isFinite(maxParam) ? Math.min(Math.max(maxParam, 10), 1000) : 400

  const result = await getNeighborhood(uid, id, depth, edgeType || undefined, maxNodes)
  return NextResponse.json(result)
}
