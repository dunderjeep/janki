import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { newCardState } from '@/lib/fsrs'

/**
 * POST /api/srs/cards/[cardId]/reset
 *
 * Resets the card's SRS schedule back to "new" — as if it has never been reviewed.
 * Stability, difficulty, reps, lapses, and dueAt are all cleared.
 * The review history in srs_reviews is preserved (for analytics).
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
    .select({ id: srsCardStates.id })
    .from(srsCardStates)
    .where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))
    .limit(1)

  if (!existing) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const resetState = newCardState()

  await db
    .update(srsCardStates)
    .set({ srs: resetState, updatedAt: new Date() })
    .where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))

  return NextResponse.json({ ok: true, newState: resetState })
}
