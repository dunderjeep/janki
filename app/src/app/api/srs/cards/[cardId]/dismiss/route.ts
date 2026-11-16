import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'

/**
 * POST /api/srs/cards/[cardId]/dismiss
 *
 * Snoozes the card until tomorrow without touching stability, difficulty,
 * reps, lapses, or state — pure dueAt override.  No review is logged.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { cardId } = await params

  const [existing] = await db
    .select({ id: srsCardStates.id, srs: srsCardStates.srs })
    .from(srsCardStates)
    .where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
  const updatedSrs = { ...existing.srs, dueAt: tomorrow }

  await db
    .update(srsCardStates)
    .set({ srs: updatedSrs, updatedAt: new Date() })
    .where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))

  return NextResponse.json({ ok: true })
}
