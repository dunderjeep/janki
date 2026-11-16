import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards, srsCardStates } from '@/db'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { deckId, cards } = await req.json() as {
    deckId: string
    cards: { front: string; back: string }[]
  }

  if (!deckId || !cards?.length) {
    return NextResponse.json({ error: 'deckId and cards are required' }, { status: 400 })
  }

  const created = await db.transaction(async (tx) => {
    const results = []
    for (const { front, back } of cards) {
      if (!front.trim() || !back.trim()) continue
      const id = nanoid()
      const [card] = await tx
        .insert(srsCards)
        .values({ id, ownerUid: uid, deckId, front: front.trim(), back: back.trim() })
        .returning()
      await tx.insert(srsCardStates).values({
        id,
        ownerUid: uid,
        deckId,
        srs: newCardState(),
      })
      results.push(card)
    }
    return results
  })

  return NextResponse.json({ cards: created })
}
