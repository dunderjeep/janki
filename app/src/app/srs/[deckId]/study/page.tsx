import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates, srsCards, srsDecks, activityStreaks } from '@/db/schema/janki'
import { eq, and, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { StudyUI } from '@/components/srs/StudyUI'
import type { StudyCard } from '@/components/srs/StudyUI'
import { newCardState } from '@/lib/fsrs'

const SELECT_FIELDS = (deckName: string) => ({
  id: srsCardStates.id,
  deckId: srsCardStates.deckId,
  deckName: sql<string>`${deckName}`.as('deck_name'),
  front: srsCards.front,
  back: srsCards.back,
  imageUrl:      srsCards.imageUrl,
  imagePath:     srsCards.imagePath,
  audioUrl:      srsCards.audioUrl,
  audioPath:     srsCards.audioPath,
  backImageUrl:  srsCards.backImageUrl,
  backImagePath: srsCards.backImagePath,
  backAudioUrl:  srsCards.backAudioUrl,
  backAudioPath: srsCards.backAudioPath,
  frontDiagram:  srsCards.frontDiagram,
  backDiagram:   srsCards.backDiagram,
  frontSvg:      srsCards.frontSvg,
  backSvg:       srsCards.backSvg,
  srs: srsCardStates.srs,
  tags: srsCards.tags,
  accepted: srsCards.accepted,
  strict: srsCards.strict,
})

// Fisher–Yates — cram sessions shouldn't replay the same order every time
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export default async function DeckStudyPage({
  params,
  searchParams,
}: {
  params:       Promise<{ deckId: string }>
  searchParams: Promise<{ upcoming?: string; all?: string }>
}) {
  const { deckId }        = await params
  const { upcoming, all } = await searchParams
  const upcomingN    = upcoming ? Math.max(1, Math.min(500, parseInt(upcoming, 10) || 20)) : null
  const reviewAll    = all === '1'
  const session = await auth()
  const uid = session!.user.id

  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)

  if (!deck) notFound()

  // Start from srsCards + leftJoin state so new (unstudied) cards are included
  const CARD_FIELDS = {
    id: srsCards.id, deckId: srsCards.deckId, deckName: srsDecks.name,
    front: srsCards.front, back: srsCards.back,
    imageUrl:      srsCards.imageUrl,      imagePath:     srsCards.imagePath,
    audioUrl:      srsCards.audioUrl,      audioPath:     srsCards.audioPath,
    backImageUrl:  srsCards.backImageUrl,  backImagePath: srsCards.backImagePath,
    backAudioUrl:  srsCards.backAudioUrl,  backAudioPath: srsCards.backAudioPath,
    frontDiagram:  srsCards.frontDiagram,  backDiagram:   srsCards.backDiagram,
    frontSvg:      srsCards.frontSvg,      backSvg:       srsCards.backSvg,
    srs: srsCardStates.srs, tags: srsCards.tags,
    accepted: srsCards.accepted, strict: srsCards.strict,
  }

  let queue: StudyCard[]

  if (reviewAll) {
    // "Review all" mode: every card in the deck, shuffled, regardless of due date
    const rows = await db
      .select(CARD_FIELDS)
      .from(srsCards)
      .leftJoin(srsCardStates, and(eq(srsCardStates.id, srsCards.id), eq(srsCardStates.ownerUid, uid)))
      .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
      .where(eq(srsCards.deckId, deckId))
      .limit(500)

    queue = shuffle(rows.map(r => ({ ...r, srs: r.srs ?? newCardState() })))
  } else if (upcomingN !== null) {
    // "Review N upcoming" mode: top N cards ordered by dueAt, regardless of due status
    const rows = await db
      .select(CARD_FIELDS)
      .from(srsCards)
      .leftJoin(srsCardStates, and(eq(srsCardStates.id, srsCards.id), eq(srsCardStates.ownerUid, uid)))
      .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
      .where(eq(srsCards.deckId, deckId))
      .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC NULLS LAST`)
      .limit(upcomingN)

    queue = rows.map(r => ({ ...r, srs: r.srs ?? newCardState() }))
  } else {
    // Normal mode: new cards (no state row) + cards due now
    const due = await db
      .select(CARD_FIELDS)
      .from(srsCards)
      .leftJoin(srsCardStates, and(eq(srsCardStates.id, srsCards.id), eq(srsCardStates.ownerUid, uid)))
      .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
      .where(
        and(
          eq(srsCards.deckId, deckId),
          sql`(${srsCardStates.id} IS NULL OR janki.parse_due_at(${srsCardStates.srs}) <= NOW())`,
        )
      )
      .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC NULLS LAST`)
      .limit(500)

    queue = due.map(r => ({ ...r, srs: r.srs ?? newCardState() }))
  }

  const [streakRow] = await db
    .select()
    .from(activityStreaks)
    .where(and(eq(activityStreaks.ownerUid, uid), eq(activityStreaks.activity, 'srs')))
    .limit(1)

  // A shuffled cram run passes sessionDeckId={null} so it doesn't overwrite the
  // saved cursor of the real (due) session for this deck.
  return (
    <StudyUI
      initialQueue={queue}
      backHref={`/srs/${deckId}`}
      isMasterStudy={false}
      sessionDeckId={reviewAll ? null : deckId}
      initialStreak={streakRow ? { count: streakRow.streakCount, longest: streakRow.longestStreak } : null}
    />
  )
}
