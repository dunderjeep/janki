import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards, srsCardStates, srsDecks } from '@/db'
import { eq, and, inArray } from 'drizzle-orm'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { cardIds, targetDeckId } = await req.json() as {
    cardIds: string[]
    targetDeckId: string
  }

  if (!targetDeckId || !cardIds?.length) {
    return NextResponse.json({ error: 'cardIds and targetDeckId are required' }, { status: 400 })
  }

  // Verify target deck belongs to this user
  const [targetDeck] = await db
    .select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, targetDeckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!targetDeck) {
    return NextResponse.json({ error: 'Target deck not found' }, { status: 404 })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(srsCards)
      .set({ deckId: targetDeckId })
      .where(and(inArray(srsCards.id, cardIds), eq(srsCards.ownerUid, uid)))

    await tx
      .update(srsCardStates)
      .set({ deckId: targetDeckId })
      .where(and(inArray(srsCardStates.id, cardIds), eq(srsCardStates.ownerUid, uid)))
  })

  return NextResponse.json({ moved: cardIds.length })
}
