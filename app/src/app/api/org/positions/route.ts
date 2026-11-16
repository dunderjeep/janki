import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { savePositions, clearPosition, type Position } from '@/lib/orgStore'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const raw = Array.isArray(body?.positions) ? body.positions : []

  const positions: Position[] = raw
    .filter((p: unknown): p is Position => {
      const v = p as Position
      return typeof v?.orgId === 'string' && Number.isFinite(v?.x) && Number.isFinite(v?.y)
    })
    .map((p: Position) => ({
      orgId: p.orgId,
      x: p.x,
      y: p.y,
      pinned: Boolean(p.pinned),
      angle: Number.isFinite(p.angle) ? Number(p.angle) : null,
      bandT: Number.isFinite(p.bandT) ? Number(p.bandT) : null,
      placedRing: Number.isInteger(p.placedRing) ? Number(p.placedRing) : null,
    }))

  await savePositions(session.user.id, positions)
  return NextResponse.json({ saved: positions.length })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  await clearPosition(session.user.id, orgId)
  return NextResponse.json({ ok: true })
}
