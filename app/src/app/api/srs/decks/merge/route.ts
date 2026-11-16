/**
 * POST /api/srs/decks/merge
 *
 * Moves every card out of `sourceDeckIds` into one target deck — either an
 * existing one (`targetDeckId`) or a new deck created here (`targetDeckName`).
 * Optionally deletes the emptied source decks afterwards.
 *
 * Body: {
 *   sourceDeckIds: string[]
 *   targetDeckId?: string
 *   targetDeckName?: string
 *   deleteEmptied?: boolean
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, srsSessions } from '@/db/schema/janki'
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    sourceDeckIds?:  string[]
    targetDeckId?:   string
    targetDeckName?: string
    deleteEmptied?:  boolean
  }

  const sourceDeckIds = [...new Set(body.sourceDeckIds ?? [])]
  if (sourceDeckIds.length === 0) {
    return NextResponse.json({ error: 'sourceDeckIds is required' }, { status: 400 })
  }
  if (!body.targetDeckId && !body.targetDeckName?.trim()) {
    return NextResponse.json({ error: 'targetDeckId or targetDeckName is required' }, { status: 400 })
  }

  // Every source must be yours — a partial match means a bad request, not a partial merge
  const sources = await db
    .select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(inArray(srsDecks.id, sourceDeckIds), eq(srsDecks.ownerUid, uid)))
  if (sources.length !== sourceDeckIds.length) {
    return NextResponse.json({ error: 'One or more source decks were not found' }, { status: 404 })
  }

  let targetDeckId = body.targetDeckId ?? null
  let createdDeck  = false

  if (targetDeckId) {
    const [target] = await db
      .select({ id: srsDecks.id })
      .from(srsDecks)
      .where(and(eq(srsDecks.id, targetDeckId), eq(srsDecks.ownerUid, uid)))
      .limit(1)
    if (!target) return NextResponse.json({ error: 'Target deck not found' }, { status: 404 })
  } else {
    targetDeckId = nanoid()
    await db.insert(srsDecks).values({
      id:       targetDeckId,
      ownerUid: uid,
      name:     body.targetDeckName!.trim(),
      active:   true,
    })
    createdDeck = true
  }

  // Merging a deck into itself would delete the deck its own cards just landed in
  const from = sourceDeckIds.filter(id => id !== targetDeckId)
  if (from.length === 0) {
    return NextResponse.json({ moved: 0, deleted: 0, targetDeckId, createdDeck })
  }

  const result = await db.transaction(async (tx) => {
    const moved = await tx
      .update(srsCards)
      .set({ deckId: targetDeckId! })
      .where(and(inArray(srsCards.deckId, from), eq(srsCards.ownerUid, uid)))
      .returning({ id: srsCards.id })

    await tx
      .update(srsCardStates)
      .set({ deckId: targetDeckId!, updatedAt: new Date() })
      .where(and(inArray(srsCardStates.deckId, from), eq(srsCardStates.ownerUid, uid)))

    let deleted = 0
    if (body.deleteEmptied) {
      // Sessions point at a deck without a foreign key, so clear them by hand
      await tx
        .delete(srsSessions)
        .where(and(inArray(srsSessions.deckId, from), eq(srsSessions.ownerUid, uid)))

      const gone = await tx
        .delete(srsDecks)
        .where(and(inArray(srsDecks.id, from), eq(srsDecks.ownerUid, uid)))
        .returning({ id: srsDecks.id })
      deleted = gone.length
    }

    return { moved: moved.length, deleted }
  })

  return NextResponse.json({ ...result, targetDeckId, createdDeck })
}
