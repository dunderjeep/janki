import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards, srsDecks, srsCardStates } from '@/db'
import { eq, and } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  const [row] = await db
    .select({
      id: srsCards.id,
      front: srsCards.front,
      back: srsCards.back,
      tags: srsCards.tags,
      accepted: srsCards.accepted,
      strict: srsCards.strict,
      deckId: srsCards.deckId,
      deckName: srsDecks.name,
      imageUrl: srsCards.imageUrl,
      imagePath: srsCards.imagePath,
      audioUrl: srsCards.audioUrl,
      audioPath: srsCards.audioPath,
      backImageUrl: srsCards.backImageUrl,
      backImagePath: srsCards.backImagePath,
      backAudioUrl: srsCards.backAudioUrl,
      backAudioPath: srsCards.backAudioPath,
      frontDiagram: srsCards.frontDiagram,
      backDiagram: srsCards.backDiagram,
      frontSvg: srsCards.frontSvg,
      backSvg: srsCards.backSvg,
    })
    .from(srsCards)
    .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ card: row })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  await db.transaction(async (tx) => {
    await tx.delete(srsCardStates).where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))
    await tx.delete(srsCards).where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  const body = await req.json() as {
    front?:         string
    back?:          string
    tags?:          string[]
    accepted?:      string[]
    strict?:        boolean
    imageUrl?:      string | null
    imagePath?:     string | null
    audioUrl?:      string | null
    audioPath?:     string | null
    backImageUrl?:  string | null
    backImagePath?: string | null
    backAudioUrl?:  string | null
    backAudioPath?: string | null
    frontDiagram?:  string | null
    backDiagram?:   string | null
    frontSvg?:      string | null
    backSvg?:       string | null
  }

  const [updated] = await db
    .update(srsCards)
    .set({
      ...(body.front         !== undefined && { front:         body.front }),
      ...(body.back          !== undefined && { back:          body.back }),
      ...(body.tags          !== undefined && { tags:          body.tags }),
      ...(body.accepted      !== undefined && { accepted:      body.accepted }),
      ...(body.strict        !== undefined && { strict:        body.strict }),
      ...(body.imageUrl      !== undefined && { imageUrl:      body.imageUrl }),
      ...(body.imagePath     !== undefined && { imagePath:     body.imagePath }),
      ...(body.audioUrl      !== undefined && { audioUrl:      body.audioUrl }),
      ...(body.audioPath     !== undefined && { audioPath:     body.audioPath }),
      ...(body.backImageUrl  !== undefined && { backImageUrl:  body.backImageUrl }),
      ...(body.backImagePath !== undefined && { backImagePath: body.backImagePath }),
      ...(body.backAudioUrl  !== undefined && { backAudioUrl:  body.backAudioUrl }),
      ...(body.backAudioPath !== undefined && { backAudioPath: body.backAudioPath }),
      ...(body.frontDiagram  !== undefined && { frontDiagram:  body.frontDiagram }),
      ...(body.backDiagram   !== undefined && { backDiagram:   body.backDiagram }),
      ...(body.frontSvg      !== undefined && { frontSvg:      body.frontSvg }),
      ...(body.backSvg       !== undefined && { backSvg:       body.backSvg }),
      updatedAt: new Date(),
    })
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ card: updated })
}
