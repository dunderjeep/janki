import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsDecks } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const [card] = await db
    .select({
      id: srsCards.id,
      front: srsCards.front,
      back: srsCards.back,
      deckId: srsCards.deckId,
      deckName: srsDecks.name,
    })
    .from(srsCards)
    .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
    .where(eq(srsCards.ownerUid, uid))
    .orderBy(sql`random()`)
    .limit(1)

  if (!card) return NextResponse.json({ error: 'No cards found' }, { status: 404 })
  return NextResponse.json({ card })
}
