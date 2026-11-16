import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates, srsReviews, srsSessions, activityStreaks } from '@/db/schema/janki'
import { eq, and, isNull } from 'drizzle-orm'
import { scheduleNext, scheduleCustom } from '@/lib/fsrs'
import { advanceStreak, resolveLocalDate } from '@/lib/streak'
import type { Grade, SessionProgress } from '@/db/schema/janki'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    cardId: string
    deckId: string
    sessionDeckId?: string | null   // null = master study, deckId = single deck
    grade: Grade
    customDays?: number             // override interval (treated as 'good' for S/D)
    sessionId: string | null
    queue: string[]
    cursor: number
    isFirstReview: boolean
    transcript?: string
    correct?: boolean | null
    localDate?: string              // client's own YYYY-MM-DD; see lib/streak.ts
  }

  const { cardId, deckId, grade, queue, cursor } = body

  // 1. Load current card state
  const [cardState] = await db
    .select()
    .from(srsCardStates)
    .where(and(eq(srsCardStates.id, cardId), eq(srsCardStates.ownerUid, uid)))
    .limit(1)

  if (!cardState) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  // 2. Compute next SRS state
  const srsBefore = cardState.srs
  const srsAfter = body.customDays != null
    ? scheduleCustom(srsBefore, body.customDays)
    : scheduleNext(srsBefore, grade)

  // 3. Persist everything in a transaction
  let sessionId = body.sessionId
  let streakCount = 0
  let longestStreak = 0

  await db.transaction(async (tx) => {
    // Update card state
    await tx
      .update(srsCardStates)
      .set({ srs: srsAfter, updatedAt: new Date() })
      .where(eq(srsCardStates.id, cardId))

    // Insert review log
    await tx.insert(srsReviews).values({
      id: nanoid(),
      ownerUid: uid,
      sessionId,
      deckId,
      cardId,
      grade,
      transcript: body.transcript ?? '',
      rawAnswer: body.transcript ?? '',
      correct: body.correct ?? null,
      reviewedAt: new Date(),
    })

    // Upsert session
    const progress: SessionProgress = {
      sessionQueue: queue,
      cursor: cursor + 1,
      sessionSource: 'due',
      cardUpdates: { [cardId]: srsAfter },
      reviews: [{ cardId, grade, reviewedAt: new Date().toISOString() }],
      dueSeedIds: [],
    }

    if (!sessionId) {
      sessionId = nanoid()
      await tx.insert(srsSessions).values({
        id: sessionId,
        ownerUid: uid,
        deckId: body.sessionDeckId ?? null,
        status: 'active',
        cardIds: queue,
        progress,
      })
    } else {
      await tx
        .update(srsSessions)
        .set({
          progress,
          updatedAt: new Date(),
        })
        .where(and(eq(srsSessions.id, sessionId), eq(srsSessions.ownerUid, uid)))
    }

    // Upsert streak if first review of the session
    if (body.isFirstReview) {
      const today = resolveLocalDate(body.localDate)

      const [existing] = await tx
        .select()
        .from(activityStreaks)
        .where(and(eq(activityStreaks.ownerUid, uid), eq(activityStreaks.activity, 'srs')))
        .limit(1)

      const next = advanceStreak(existing ?? null, today)
      streakCount = next.streakCount
      longestStreak = next.longestStreak

      await tx
        .insert(activityStreaks)
        .values({
          ownerUid: uid,
          activity: 'srs',
          streakCount: next.streakCount,
          longestStreak: next.longestStreak,
          lastStudyDate: next.lastStudyDate,
        })
        .onConflictDoUpdate({
          target: [activityStreaks.ownerUid, activityStreaks.activity],
          set: {
            streakCount: next.streakCount,
            longestStreak: next.longestStreak,
            lastStudyDate: next.lastStudyDate,
            updatedAt: new Date(),
          },
        })
    }
  })

  return NextResponse.json({
    nextState: srsAfter,
    sessionId,
    ...(body.isFirstReview && { streak: { count: streakCount, longest: longestStreak } }),
  })
}

// Mark a session complete
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { sessionId } = await req.json() as { sessionId: string }

  await db
    .update(srsSessions)
    .set({ status: 'completed', endedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(srsSessions.id, sessionId), eq(srsSessions.ownerUid, uid)))

  return NextResponse.json({ ok: true })
}
