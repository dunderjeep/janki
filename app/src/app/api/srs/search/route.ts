import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsDecks } from '@/db/schema/janki'
import { eq, and, or, ilike } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const deckId = searchParams.get('deckId') ?? undefined

  if (q.length < 2) return NextResponse.json({ results: [] })

  const pattern = `%${q}%`

  const rows = await db
    .select({
      id: srsCards.id,
      front: srsCards.front,
      back: srsCards.back,
      deckId: srsCards.deckId,
      deckName: srsDecks.name,
    })
    .from(srsCards)
    .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
    .where(
      and(
        eq(srsCards.ownerUid, uid),
        deckId ? eq(srsCards.deckId, deckId) : undefined,
        or(ilike(srsCards.front, pattern), ilike(srsCards.back, pattern)),
      ),
    )
    .limit(12)

  return NextResponse.json({ results: rows })
}
