import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsSessions } from '@/db'
import { eq, and } from 'drizzle-orm'
import type { SessionProgress } from '@/db/schema/janki'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { sessionId } = await params

  const body = await req.json() as Partial<SessionProgress>

  await db
    .update(srsSessions)
    .set({ progress: body as SessionProgress, updatedAt: new Date() })
    .where(and(eq(srsSessions.id, sessionId), eq(srsSessions.ownerUid, uid)))

  return NextResponse.json({ ok: true })
}
