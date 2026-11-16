/**
 * POST /api/courses/[bookId]/cards
 *
 * Turns enriched problems into SRS cards in the chapter's deck — the step that
 * was missing between the Courses app and the SRS. Two cards per problem:
 *
 *   situation → "here's the situation, which move does it call for?"  (recall the technique)
 *   technique → the problem statement itself, answered by trick + sketch (recall the approach)
 *
 * Only enriched problems (trick present) qualify — an unenriched problem has no
 * answer side. Re-running is safe: problems already linked in
 * course_problem_cards are skipped.
 *
 * Body: { chapterId: string; sectionId?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections, courseProblems, courseProblemCards,
  srsDecks, srsCards, srsCardStates,
} from '@/db/schema/janki'
import type { ProblemCardRole } from '@/db/schema/janki'
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

type ProblemRow = typeof courseProblems.$inferSelect

function statementText(p: ProblemRow): string {
  const parts = (p.subParts ?? [])
    .map(sp => `(${sp.label || '?'}) ${sp.text}`)
    .join('\n')
  return parts ? `${p.statement}\n${parts}` : p.statement
}

/** The cards one problem is worth, in the order they should be created. */
function cardsForProblem(
  p: ProblemRow,
  sectionNumber: string,
): { role: ProblemCardRole; front: string; back: string }[] {
  const out: { role: ProblemCardRole; front: string; back: string }[] = []
  const trick  = (p.trick ?? '').trim()
  const sketch = (p.solutionSketch ?? '').trim()
  if (!trick) return out

  const situation = (p.situation ?? '').trim()
  if (situation) {
    out.push({
      role:  'situation',
      front: `${situation}\n\nWhich move does this situation call for?`,
      back:  trick,
    })
  }

  out.push({
    role:  'technique',
    front: `Problem ${sectionNumber}.${p.number} — what is the key move?\n\n${statementText(p)}`,
    back:  sketch ? `${trick}\n\n${sketch}` : trick,
  })

  return out
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { bookId } = await params

  const [book] = await db
    .select({ id: courseBooks.id, title: courseBooks.title })
    .from(courseBooks)
    .where(and(eq(courseBooks.id, bookId), eq(courseBooks.ownerUid, uid)))
    .limit(1)
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

  const { chapterId, sectionId } = await req.json() as { chapterId: string; sectionId?: string }
  if (!chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 })

  const [chapter] = await db
    .select()
    .from(courseChapters)
    .where(and(eq(courseChapters.id, chapterId), eq(courseChapters.bookId, bookId)))
    .limit(1)
  if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })

  // The chapter's deck, created on demand if the import never made one
  let deckId = chapter.deckId
  if (deckId) {
    const [deck] = await db
      .select({ id: srsDecks.id })
      .from(srsDecks)
      .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
      .limit(1)
    if (!deck) deckId = null
  }
  if (!deckId) {
    deckId = nanoid()
    await db.insert(srsDecks).values({
      id:          deckId,
      ownerUid:    uid,
      name:        `${book.title} — Ch. ${chapter.number}: ${chapter.title}`,
      description: `Cards generated from Chapter ${chapter.number} problems.`,
      active:      true,
    })
    await db.update(courseChapters).set({ deckId, updatedAt: new Date() }).where(eq(courseChapters.id, chapterId))
  }

  const sections = await db
    .select({ id: courseSections.id, number: courseSections.number })
    .from(courseSections)
    .where(sectionId ? eq(courseSections.id, sectionId) : eq(courseSections.chapterId, chapterId))

  const sectionNumber = new Map(sections.map(s => [s.id, s.number]))
  if (sections.length === 0) return NextResponse.json({ created: 0, skipped: 0, deckId })

  const problems = await db
    .select()
    .from(courseProblems)
    .where(inArray(courseProblems.sectionId, sections.map(s => s.id)))
    .orderBy(courseProblems.sectionId, courseProblems.number)

  // Problems that already produced cards — re-running must not duplicate them
  const linked = problems.length > 0
    ? await db
        .select({ problemId: courseProblemCards.problemId })
        .from(courseProblemCards)
        .where(inArray(courseProblemCards.problemId, problems.map(p => p.id)))
    : []
  const alreadyCarded = new Set(linked.map(l => l.problemId))

  // Cards already sitting in this deck, by front. Earlier runs (and hand-made
  // cards) predate course_problem_cards — adopt those rather than duplicating them.
  const existing = await db
    .select({ id: srsCards.id, front: srsCards.front })
    .from(srsCards)
    .where(and(eq(srsCards.deckId, deckId), eq(srsCards.ownerUid, uid)))
  const byFront = new Map(existing.map(c => [c.front.trim(), c.id]))

  let created  = 0
  let adopted  = 0
  let skipped  = 0
  let unenriched = 0

  for (const p of problems) {
    if (alreadyCarded.has(p.id)) { skipped++; continue }
    if (!p.trick) { unenriched++; continue }

    const tags = [
      `ch${chapter.number}`,
      ...(p.techniqueTags ?? []),
      ...(p.techniqueTag ? [p.techniqueTag] : []),
    ]
    const cards = cardsForProblem(p, sectionNumber.get(p.sectionId) ?? String(chapter.number))
    if (cards.length === 0) { unenriched++; continue }

    await db.transaction(async (tx) => {
      for (const c of cards) {
        const twin = byFront.get(c.front.trim())
        if (twin) {
          await tx.insert(courseProblemCards)
            .values({ problemId: p.id, cardId: twin, cardRole: c.role })
            .onConflictDoNothing()
          adopted++
          continue
        }

        const cardId = nanoid()
        await tx.insert(srsCards).values({
          id:       cardId,
          ownerUid: uid,
          deckId:   deckId!,
          front:    c.front,
          back:     c.back,
          tags:     [...new Set(tags)],
        })
        await tx.insert(srsCardStates).values({
          id:       cardId,
          ownerUid: uid,
          deckId:   deckId!,
          srs:      newCardState(),
        })
        await tx.insert(courseProblemCards).values({
          problemId: p.id,
          cardId,
          cardRole:  c.role,
        })
        byFront.set(c.front.trim(), cardId)
        created++
      }
    })
  }

  // A deck with cards in it should be studyable — imports create them paused
  if (created > 0) {
    await db
      .update(srsDecks)
      .set({ active: true, updatedAt: new Date() })
      .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
  }

  return NextResponse.json({ created, adopted, skipped, unenriched, deckId })
}
