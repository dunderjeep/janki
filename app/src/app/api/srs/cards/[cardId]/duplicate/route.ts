import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards, srsCardStates } from '@/db'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params
  const { mode } = await req.json() as { mode: 'shallow' | 'deep' }

  const [src] = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const newId = nanoid()

  const values: typeof srsCards.$inferInsert = {
    id:       newId,
    ownerUid: uid,
    deckId:   src.deckId,
    front:    src.front,
    back:     src.back,
    tags:     src.tags,
    accepted: src.accepted,
    strict:   src.strict,
  }

  if (mode === 'deep') {
    // Copy URLs (shared reference) but NOT paths — paths are MinIO object keys
    // used for deletion; sharing them would cause double-deletion if either
    // card is deleted.
    values.imageUrl     = src.imageUrl
    values.audioUrl     = src.audioUrl
    values.backImageUrl = src.backImageUrl
    values.backAudioUrl = src.backAudioUrl
    // Diagrams and SVGs are inline text — safe to copy directly.
    values.frontDiagram = src.frontDiagram
    values.backDiagram  = src.backDiagram
    values.frontSvg     = src.frontSvg
    values.backSvg      = src.backSvg
  }

  await db.transaction(async (tx) => {
    await tx.insert(srsCards).values(values)
    await tx.insert(srsCardStates).values({
      id:       newId,
      ownerUid: uid,
      deckId:   src.deckId,
      srs:      newCardState(),
    })
  })

  return NextResponse.json({ cardId: newId, deckId: src.deckId })
}
