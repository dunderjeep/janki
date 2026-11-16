import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCardMastery } from '@/lib/graphStore'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mastery = await getCardMastery(session.user.id)
  return NextResponse.json({ mastery })
}
