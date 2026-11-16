/**
 * GET /api/srs/cards/lookup?term=gauge+field
 *
 * Finds a card whose front text matches the term.
 * Priority: exact match → case-insensitive exact → contains match.
 * Returns the first match or null.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsDecks } from '@/db/schema/janki'
import { eq, and, ilike, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const term = req.nextUrl.searchParams.get('term')?.trim() ?? ''
  if (!term) return NextResponse.json({ card: null })

  const fields = {
    id:      srsCards.id,
    front:   srsCards.front,
    back:    srsCards.back,
    deckId:  srsCards.deckId,
    deckName: srsDecks.name,
  }

  const base = db.select(fields).from(srsCards)
    .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))

  // 1. Exact match (case-insensitive via lower())
  const [exact] = await base
    .where(and(
      eq(srsCards.ownerUid, uid),
      sql`lower(${srsCards.front}) = lower(${term})`,
    ))
    .limit(1)

  if (exact) return NextResponse.json({ card: exact })

  // 2. Front contains the term
  const [contains] = await base
    .where(and(
      eq(srsCards.ownerUid, uid),
      ilike(srsCards.front, `%${term}%`),
    ))
    .limit(1)

  return NextResponse.json({ card: contains ?? null })
}
