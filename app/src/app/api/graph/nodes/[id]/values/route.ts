import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getValuesForEntity } from '@/lib/graphStore'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { id } = await params
  const values = await getValuesForEntity(uid, id)
  return NextResponse.json({ values })
}
