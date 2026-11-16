import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCardStates } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { newCardState } from '@/lib/fsrs'

/**
 * POST /api/srs/decks/[deckId]/reset
 *
 * Resets every card in the deck back to "new" — as if none had been reviewed.
 * The review history in srs_reviews is preserved (for analytics).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { deckId } = await params

  const [deck] = await db
    .select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const reset = await db
    .update(srsCardStates)
    .set({ srs: newCardState(), updatedAt: new Date() })
    .where(and(eq(srsCardStates.deckId, deckId), eq(srsCardStates.ownerUid, uid)))
    .returning({ id: srsCardStates.id })

  return NextResponse.json({ ok: true, count: reset.length })
}
