import { auth } from '@/auth'
import { db } from '@/db'
import {
  srsCardStates, srsCards, srsDecks, activityStreaks,
  srsTopicParents, srsTopicDecks,
} from '@/db/schema/janki'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { StudyUI } from '@/components/srs/StudyUI'
import type { StudyCard } from '@/components/srs/StudyUI'
import { newCardState } from '@/lib/fsrs'

// One session's worth of cards. The whole queue ships to the client, so this is
// a payload ceiling, not a study-policy one — the rest stay due for next time.
const QUEUE_LIMIT = 500

const SELECT_FIELDS = {
  id: srsCardStates.id,
  deckId: srsCardStates.deckId,
  deckName: srsDecks.name,
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
}

// Deck ids belonging to a topic and all of its descendant topics.
// Returns [] when the topic has no decks, which scopes the queue to nothing.
async function deckIdsForTopic(topicId: string): Promise<string[]> {
  const [parents, deckLinks] = await Promise.all([
    db.select().from(srsTopicParents),
    db.select().from(srsTopicDecks),
  ])

  const childMap = new Map<string, string[]>()
  for (const p of parents) {
    if (!childMap.has(p.parentId)) childMap.set(p.parentId, [])
    childMap.get(p.parentId)!.push(p.topicId)
  }

  const subtree = new Set<string>()
  const walk = (id: string) => {
    if (subtree.has(id)) return
    subtree.add(id)
    for (const child of childMap.get(id) ?? []) walk(child)
  }
  walk(topicId)

  return [...new Set(deckLinks.filter((dl) => subtree.has(dl.topicId)).map((dl) => dl.deckId))]
}

// Fisher–Yates — cram sessions shouldn't replay the same order every time
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// "Review again" mode: every card in scope regardless of due date, including
// cards that have never been studied (no state row yet).
async function loadAllCards(uid: string, deckIds: string[] | null): Promise<StudyCard[]> {
  if (deckIds?.length === 0) return []
  const scope = deckIds ? inArray(srsCards.deckId, deckIds) : undefined

  const rows = await db
    .select({ ...SELECT_FIELDS, id: srsCards.id, deckId: srsCards.deckId })
    .from(srsCards)
    .leftJoin(srsCardStates, and(eq(srsCardStates.id, srsCards.id), eq(srsCardStates.ownerUid, uid)))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCards.deckId))
    .where(and(eq(srsCards.ownerUid, uid), eq(srsDecks.active, true), scope))
    .limit(QUEUE_LIMIT)

  return shuffle(rows.map((r) => ({ ...r, srs: r.srs ?? newCardState() })))
}

async function loadQueue(uid: string, deckIds: string[] | null): Promise<StudyCard[]> {
  // A topic with no decks scopes to nothing — don't fall back to every deck
  if (deckIds?.length === 0) return []
  const scope = deckIds ? inArray(srsCardStates.deckId, deckIds) : undefined

  const rows = await db
    .select(SELECT_FIELDS)
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
    .where(
      and(
        sql`${srsCardStates.ownerUid} = ${uid} AND janki.parse_due_at(${srsCardStates.srs}) <= NOW()`,
        eq(srsDecks.active, true),
        scope,
      ),
    )
    .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC`)
    .limit(QUEUE_LIMIT)

  if (rows.length > 0) return rows.map((r) => ({ ...r, srs: r.srs ?? newCardState() }))

  // Fallback: upcoming
  const upcoming = await db
    .select(SELECT_FIELDS)
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
    .where(and(eq(srsCardStates.ownerUid, uid), eq(srsDecks.active, true), scope))
    .orderBy(sql`janki.parse_due_at(${srsCardStates.srs}) ASC`)
    .limit(QUEUE_LIMIT)

  return upcoming.map((r) => ({ ...r, srs: r.srs ?? newCardState() }))
}

// How many cards are actually due in scope — the queue itself is capped at
// QUEUE_LIMIT, so the header can say "1 / 500 of 1673 due" rather than lying.
async function countDue(uid: string, deckIds: string[] | null): Promise<number> {
  if (deckIds?.length === 0) return 0
  const scope = deckIds ? inArray(srsCardStates.deckId, deckIds) : undefined

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(srsCardStates)
    .innerJoin(srsCards, eq(srsCards.id, srsCardStates.id))
    .innerJoin(srsDecks, eq(srsDecks.id, srsCardStates.deckId))
    .where(
      and(
        sql`${srsCardStates.ownerUid} = ${uid} AND janki.parse_due_at(${srsCardStates.srs}) <= NOW()`,
        eq(srsDecks.active, true),
        scope,
      ),
    )

  return Number(row?.n ?? 0)
}

export default async function MasterStudyPage({
  searchParams,
}: {
  searchParams: Promise<{ topicId?: string; all?: string }>
}) {
  const { topicId, all } = await searchParams
  const reviewAll = all === '1'
  const session = await auth()
  const uid = session!.user.id
  const deckIds = topicId ? await deckIdsForTopic(topicId) : null
  const [queue, streakRow, dueTotal] = await Promise.all([
    reviewAll ? loadAllCards(uid, deckIds) : loadQueue(uid, deckIds),
    db
      .select()
      .from(activityStreaks)
      .where(and(eq(activityStreaks.ownerUid, uid), eq(activityStreaks.activity, 'srs')))
      .limit(1),
    countDue(uid, deckIds),
  ])
  const streak = streakRow[0] ?? null

  return (
    <StudyUI
      initialQueue={queue}
      dueTotal={dueTotal}
      backHref={topicId ? `/srs/topics/${topicId}` : '/srs'}
      isMasterStudy
      sessionDeckId={null}
      initialStreak={streak ? { count: streak.streakCount, longest: streak.longestStreak } : null}
    />
  )
}
