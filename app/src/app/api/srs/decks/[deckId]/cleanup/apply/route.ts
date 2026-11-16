import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates } from '@/db/schema/janki'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'

interface ApplyBody {
  toRemove:  string[]
  toModify:  { id: string; front: string; back: string }[]
  toAdd:     { front: string; back: string; reason: string }[]
}

export async function POST(
  req: NextRequest,
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

  const body = await req.json() as ApplyBody

  await db.transaction(async (tx) => {
    // 1. Delete removed cards + their states
    if (body.toRemove.length > 0) {
      await tx.delete(srsCardStates).where(
        and(inArray(srsCardStates.id, body.toRemove), eq(srsCardStates.ownerUid, uid))
      )
      await tx.delete(srsCards).where(
        and(inArray(srsCards.id, body.toRemove), eq(srsCards.deckId, deckId))
      )
    }

    // 2. Update modified cards (preserve SRS state — only content changes)
    for (const m of body.toModify) {
      await tx
        .update(srsCards)
        .set({ front: m.front, back: m.back, updatedAt: new Date() })
        .where(and(eq(srsCards.id, m.id), eq(srsCards.deckId, deckId)))
    }

    // 3. Insert new cards + initial SRS states
    for (const a of body.toAdd) {
      const id = nanoid()
      await tx.insert(srsCards).values({
        id,
        ownerUid: uid,
        deckId,
        front: a.front,
        back: a.back,
        tags: ['cleanup'],
      })
      await tx.insert(srsCardStates).values({
        id,
        ownerUid: uid,
        deckId,
        srs: {
          state: 'new',
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
          dueAt: new Date().toISOString(),
          lastReviewedAt: null,
        },
      })
    }
  })

  return NextResponse.json({
    ok: true,
    removedCount:  body.toRemove.length,
    modifiedCount: body.toModify.length,
    addedCount:    body.toAdd.length,
  })
}
