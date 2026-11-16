import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { searchNodesByLabel } from '@/lib/graphStore'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q.trim()) {
    return NextResponse.json({ nodes: [] })
  }

  const nodes = await searchNodesByLabel(uid, q)
  return NextResponse.json({ nodes })
}
