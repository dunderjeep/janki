import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates, srsCards, srsDecks } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import { AutoFlashUI } from '@/components/srs/AutoFlashUI'
import type { StudyCard } from '@/components/srs/StudyUI'
import { newCardState } from '@/lib/fsrs'

export default async function AllAutoFlashPage() {
  const session = await auth()
  const uid = session!.user.id

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
               AND janki.parse_due_at(${srsCardStates.srs}) <= NOW()`)
    .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC`)
    .limit(300)

  const cards: StudyCard[] = due.map(r => ({ ...r, srs: r.srs ?? newCardState() }))

  return (
    <AutoFlashUI
      cards={cards}
      backHref="/srs"
      sessionDeckId={null}
      deckName="All Decks"
    />
  )
}
