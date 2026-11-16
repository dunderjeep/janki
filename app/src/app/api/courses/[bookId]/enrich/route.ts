/**
 * POST /api/courses/[bookId]/enrich
 *
 * Claude-enriches unenriched problems in a chapter or section.
 * Adds: situation, trick, technique_tags, solution_sketch.
 *
 * Body: { chapterId?: string; sectionId?: string; limit?: number }
 *
 * Runs sequentially (not parallel) to keep API usage predictable.
 * Pass limit to process a subset — e.g. limit:5 to preview before running all.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections, courseProblems,
} from '@/db/schema/janki'
import { and, eq, isNull, sql } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

type EnrichResult = {
  situation: string
  trick: string
  technique_tags: string[]
  solution_sketch: string
}

function buildPrompt(
  chapterTitle: string,
  sectionTitle: string,
  statement: string,
  subParts: Array<{ label: string; text: string }>,
): string {
  const partsText = subParts.length > 0
    ? '\nSub-parts:\n' + subParts.map(p => `  (${p.label || '?'}) ${p.text}`).join('\n')
    : ''

  return `You are a math pedagogy expert helping a learner master "How to Prove It" by Daniel J. Velleman.

Context:
  Chapter: ${chapterTitle}
  Section: ${sectionTitle}

Problem:
  ${statement}${partsText}

Analyze this problem from a pedagogical standpoint. Your goal is to make explicit what is usually left implicit — the "trick" or key move that unlocks the problem, and the situation that calls for it.

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "situation": "One or two sentences describing the real-world or abstract situation that signals this technique is needed. Like: 'You have two possibilities and can rule one out' or 'You need to show two sets are equal'.",
  "trick": "The single unlocking insight — what an expert would say in 10 seconds to unstick a student. Not the full solution, just the key move.",
  "technique_tags": ["snake_case_tag1", "snake_case_tag2"],
  "solution_sketch": "A brief sketch of the approach (2-4 sentences), not a full proof."
}

For technique_tags use values like: logical_form, truth_table, proof_by_contradiction, proof_by_contrapositive, direct_proof, induction, existential_proof, uniqueness_proof, set_theory, quantifiers, biconditional, disjunction, conjunction, equivalence, modus_ponens, modus_tollens, deductive_argument, well_formed_formula

Only include tags that genuinely apply. 1-3 tags is typical.`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { bookId } = await params

  // Verify ownership
  const [book] = await db
    .select({ id: courseBooks.id })
    .from(courseBooks)
    .where(and(eq(courseBooks.id, bookId), eq(courseBooks.ownerUid, uid)))
    .limit(1)
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    chapterId?: string
    sectionId?: string
    limit?: number
  }
  const { chapterId, sectionId, limit = 50 } = body

  // ── Fetch unenriched problems in scope ────────────────────────────────────
  type ProblemRow = typeof courseProblems.$inferSelect & {
    chapterTitle: string
    sectionTitle: string
  }

  let problems: ProblemRow[]

  if (sectionId) {
    const [sec] = await db.select().from(courseSections).where(eq(courseSections.id, sectionId)).limit(1)
    if (!sec) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    const [ch] = await db.select().from(courseChapters).where(eq(courseChapters.id, sec.chapterId)).limit(1)

    const rows = await db
      .select()
      .from(courseProblems)
      .where(and(eq(courseProblems.sectionId, sectionId), isNull(courseProblems.trick)))
      .limit(limit)

    problems = rows.map(p => ({ ...p, chapterTitle: ch?.title ?? '', sectionTitle: sec.title }))

  } else if (chapterId) {
    const [ch] = await db.select().from(courseChapters).where(eq(courseChapters.id, chapterId)).limit(1)
    if (!ch) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })

    const sections = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.chapterId, chapterId))

    const secMap = Object.fromEntries(sections.map(s => [s.id, s.title]))
    const secIds = sections.map(s => s.id)

    if (secIds.length === 0) {
      return NextResponse.json({ enriched: 0, errors: [] })
    }

    const rows = await db
      .select()
      .from(courseProblems)
      .where(and(
        sql`${courseProblems.sectionId} = ANY(ARRAY[${sql.join(secIds.map(id => sql`${id}`), sql`, `)}]::text[])`,
        isNull(courseProblems.trick),
      ))
      .limit(limit)

    problems = rows.map(p => ({
      ...p,
      chapterTitle: ch.title,
      sectionTitle: secMap[p.sectionId] ?? '',
    }))

  } else {
    return NextResponse.json({ error: 'chapterId or sectionId required' }, { status: 400 })
  }

  // ── Enrich each problem sequentially ─────────────────────────────────────
  let enriched = 0
  const errors: string[] = []

  for (const problem of problems) {
    const prompt = buildPrompt(
      problem.chapterTitle,
      problem.sectionTitle,
      problem.statement,
      (problem.subParts as Array<{ label: string; text: string }>) ?? [],
    )

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',  // fast + cheap for batch enrichment
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      let text = (message.content[0] as { type: 'text'; text: string }).text.trim()
      text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()

      const result: EnrichResult = JSON.parse(text)

      await db
        .update(courseProblems)
        .set({
          situation:     result.situation,
          trick:         result.trick,
          techniqueTag:  result.technique_tags[0] ?? null,
          techniqueTags: result.technique_tags,
          solutionSketch: result.solution_sketch,
          updatedAt:     new Date(),
        })
        .where(eq(courseProblems.id, problem.id))

      enriched++
    } catch (e: any) {
      errors.push(`Problem ${problem.number} (${problem.id}): ${e.message ?? String(e)}`)
    }
  }

  return NextResponse.json({ enriched, total: problems.length, errors })
}
