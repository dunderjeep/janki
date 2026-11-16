import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getClusterStats } from '@/lib/graphStore'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clusters = await getClusterStats(session.user.id)
  return NextResponse.json({ clusters })
}
