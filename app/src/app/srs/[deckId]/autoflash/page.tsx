import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates, srsCards, srsDecks } from '@/db/schema/janki'
import { eq, and, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { AutoFlashUI } from '@/components/srs/AutoFlashUI'
import type { StudyCard } from '@/components/srs/StudyUI'
import { newCardState } from '@/lib/fsrs'

export default async function DeckAutoFlashPage({
  params,
}: {
  params: Promise<{ deckId: string }>
}) {
  const { deckId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!deck) notFound()

  // Due cards first; fall back to all cards ordered by dueAt
  const due = await db
    .select({
      id: srsCardStates.id, deckId: srsCardStates.deckId,
      deckName: srsDecks.name,
      front: srsCards.front, back: srsCards.back,
      imageUrl: srsCards.imageUrl, imagePath: srsCards.imagePath,
      audioUrl: srsCards.audioUrl, audioPath: srsCards.audioPath,
      backImageUrl: srsCards.backImageUrl, backImagePath: srsCards.backImagePath,
      backAudioUrl: srsCards.backAudioUrl, backAudioPath: srsCards.backAudioPath,
      frontDiagram: srsCards.frontDiagram, backDiagram:  srsCards.backDiagram,
      srs: srsCardStates.srs, tags: srsCards.tags,
      accepted: srsCards.accepted, strict: srsCards.strict,
    })
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
    .where(sql`${srsCardStates.ownerUid} = ${uid}
               AND ${srsCardStates.deckId} = ${deckId}
               AND janki.parse_due_at(${srsCardStates.srs}) <= NOW()`)
    .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC`)
    .limit(200)

  let cards: StudyCard[]

  if (due.length > 0) {
    cards = due.map(r => ({ ...r, srs: r.srs ?? newCardState() }))
  } else {
    const all = await db
      .select({
        id: srsCardStates.id, deckId: srsCardStates.deckId,
        deckName: srsDecks.name,
        front: srsCards.front, back: srsCards.back,
        imageUrl: srsCards.imageUrl, audioUrl: srsCards.audioUrl,
        srs: srsCardStates.srs, tags: srsCards.tags,
        accepted: srsCards.accepted, strict: srsCards.strict,
      })
      .from(srsCardStates)
      .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
      .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
      .where(and(eq(srsCardStates.ownerUid, uid), eq(srsCardStates.deckId, deckId)))
      .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC`)
      .limit(200)

    cards = all.map(r => ({ ...r, srs: r.srs ?? newCardState() }))
  }

  return (
    <AutoFlashUI
      cards={cards}
      backHref={`/srs/${deckId}`}
      sessionDeckId={deckId}
      deckName={deck.name}
    />
  )
}
