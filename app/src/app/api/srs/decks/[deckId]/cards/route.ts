import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsDecks, srsCards, srsCardStates } from '@/db'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { deckId } = await params

  // Verify deck belongs to user
  const [deck] = await db
    .select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const { cards } = await req.json() as { cards: { front: string; back: string }[] }
  if (!cards?.length) return NextResponse.json({ error: 'cards array is required' }, { status: 400 })

  let cardCount = 0
  await db.transaction(async (tx) => {
    for (const { front, back } of cards) {
      if (!front?.trim() || !back?.trim()) continue
      const cardId = nanoid()
      await tx.insert(srsCards).values({
        id: cardId,
        ownerUid: uid,
        deckId,
        front: front.trim(),
        back: back.trim(),
      })
      await tx.insert(srsCardStates).values({
        id: cardId,
        ownerUid: uid,
        deckId,
        srs: newCardState(),
      })
      cardCount++
    }
  })

  return NextResponse.json({ cardCount })
}
