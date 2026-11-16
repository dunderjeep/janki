import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsDecks, srsCards, srsCardStates } from '@/db'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { deckName, description, cards } = await req.json() as {
    deckName: string
    description?: string
    cards: { front: string; back: string }[]
  }

  if (!deckName?.trim()) {
    return NextResponse.json({ error: 'deckName is required' }, { status: 400 })
  }
  if (!cards?.length) {
    return NextResponse.json({ error: 'cards array is required' }, { status: 400 })
  }

  const deckId = nanoid()
  let cardCount = 0

  await db.transaction(async (tx) => {
    await tx.insert(srsDecks).values({
      id: deckId,
      ownerUid: uid,
      name: deckName.trim(),
      description: description?.trim() ?? '',
    })

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

  return NextResponse.json({ deckId, deckName: deckName.trim(), cardCount })
}
