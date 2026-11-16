import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, srsSessions } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const { fsrsParams, active, name, description } = body

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    patch.name = name.trim()
  }
  if (description !== undefined) {
    if (typeof description !== 'string') {
      return NextResponse.json({ error: 'description must be a string' }, { status: 400 })
    }
    patch.description = description.trim()
  }
  if (fsrsParams !== undefined) {
    if (typeof fsrsParams !== 'object') {
      return NextResponse.json({ error: 'fsrsParams must be an object' }, { status: 400 })
    }
    patch.fsrsParams = fsrsParams
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }
    patch.active = active
  }

  const [updated] = await db
    .update(srsDecks)
    .set(patch)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .returning({
      id:          srsDecks.id,
      name:        srsDecks.name,
      description: srsDecks.description,
      fsrsParams:  srsDecks.fsrsParams,
      active:      srsDecks.active,
    })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    name:        updated.name,
    description: updated.description,
    fsrsParams:  updated.fsrsParams,
    active:      updated.active,
  })
}

/**
 * DELETE /api/srs/decks/[deckId]
 *
 * Deletes the deck and everything under it: its cards, their SRS state, their
 * review history, and any topic assignments. Study sessions pinned to the deck
 * go too — they hold no FK, so nothing else would clean them up.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const cardCount = await db.transaction(async (tx) => {
    const cards = await tx
      .delete(srsCards)
      .where(and(eq(srsCards.deckId, deckId), eq(srsCards.ownerUid, uid)))
      .returning({ id: srsCards.id })

    // Cards cascade into card states, but states orphaned by an earlier bug would not
    await tx
      .delete(srsCardStates)
      .where(and(eq(srsCardStates.deckId, deckId), eq(srsCardStates.ownerUid, uid)))

    await tx
      .delete(srsSessions)
      .where(and(eq(srsSessions.deckId, deckId), eq(srsSessions.ownerUid, uid)))

    // Topic assignments cascade from the deck row
    await tx.delete(srsDecks).where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))

    return cards.length
  })

  return NextResponse.json({ ok: true, name: deck.name, cardCount })
}
