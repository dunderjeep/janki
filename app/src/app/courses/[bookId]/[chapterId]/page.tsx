import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections, courseProblems,
  courseProblemAttempts, courseProblemCards, srsCards,
} from '@/db/schema/janki'
import { eq, and, isNull, inArray, sql } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EnrichButton } from './EnrichButton'
import { GenerateCardsButton } from './GenerateCardsButton'

export async function generateMetadata({ params }: { params: Promise<{ bookId: string; chapterId: string }> }) {
  const { chapterId } = await params
  const [ch] = await db.select({ title: courseChapters.title }).from(courseChapters).where(eq(courseChapters.id, chapterId))
  return { title: ch?.title ?? 'Chapter' }
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>
}) {
  const { bookId, chapterId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [book] = await db.select({ id: courseBooks.id, title: courseBooks.title, ownerUid: courseBooks.ownerUid })
    .from(courseBooks).where(eq(courseBooks.id, bookId))
  if (!book || book.ownerUid !== uid) notFound()

  const [chapter] = await db.select().from(courseChapters).where(eq(courseChapters.id, chapterId))
  if (!chapter || chapter.bookId !== bookId) notFound()

  // Sections with their problems
  const sections = await db
    .select()
    .from(courseSections)
    .where(eq(courseSections.chapterId, chapterId))
    .orderBy(courseSections.sortOrder)

  const sectionIds = sections.map(s => s.id)

  const problems = sectionIds.length > 0
    ? await db
        .select()
        .from(courseProblems)
        .where(sql`${courseProblems.sectionId} = ANY(ARRAY[${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)}]::text[])`)
        .orderBy(courseProblems.sectionId, sql`${courseProblems.number}::int`)
    : []

  // Latest attempt outcome per problem for this user
  const attempts = sectionIds.length > 0
    ? await db
        .select({
          problemId: courseProblemAttempts.problemId,
          outcome:   courseProblemAttempts.outcome,
        })
        .from(courseProblemAttempts)
        .where(eq(courseProblemAttempts.ownerUid, uid))
        .orderBy(courseProblemAttempts.createdAt)
    : []

  // Keep only the latest outcome per problem
  const outcomeMap: Record<string, string> = {}
  for (const a of attempts) {
    outcomeMap[a.problemId] = a.outcome
  }

  // Unenriched count per section (trick is null)
  const unenrichedBySec: Record<string, number> = {}
  for (const p of problems) {
    if (!p.trick) {
      unenrichedBySec[p.sectionId] = (unenrichedBySec[p.sectionId] ?? 0) + 1
    }
  }
  const totalUnenriched = Object.values(unenrichedBySec).reduce((a, b) => a + b, 0)

  // Problems already turned into SRS cards — the rest are what "Make cards" would do
  const carded = problems.length > 0
    ? await db
        .select({ problemId: courseProblemCards.problemId })
        .from(courseProblemCards)
        .where(inArray(courseProblemCards.problemId, problems.map(p => p.id)))
    : []
  const cardedProblems = new Set(carded.map(c => c.problemId))
  const pendingCards = problems.filter(p => p.trick && !cardedProblems.has(p.id)).length

  // Cards this chapter's deck already holds
  const [deckCards] = chapter.deckId
    ? await db
        .select({ n: sql<number>`count(*)` })
        .from(srsCards)
        .where(and(eq(srsCards.deckId, chapter.deckId), eq(srsCards.ownerUid, uid)))
    : [{ n: 0 }]

  // Group problems by section
  const problemsBySection = new Map<string, typeof problems>()
  for (const p of problems) {
    if (!problemsBySection.has(p.sectionId)) problemsBySection.set(p.sectionId, [])
    problemsBySection.get(p.sectionId)!.push(p)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/courses" className="hover:text-gray-600">Courses</Link>
        <span>/</span>
        <Link href={`/courses/${bookId}`} className="hover:text-gray-600">{book.title}</Link>
        <span>/</span>
        <span className="text-gray-600">Chapter {chapter.number}</span>
      </div>

      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">
              Chapter {chapter.number}: {chapter.title}
            </h1>
            {chapter.masteryUnlocked && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                Mastered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/courses/${bookId}/${chapterId}/read`}
              className="text-sm border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Read
            </Link>
            <EnrichButton
              bookId={bookId}
              chapterId={chapterId}
              unenrichedCount={totalUnenriched}
              label={`Enrich all (${totalUnenriched})`}
            />
            <GenerateCardsButton
              bookId={bookId}
              chapterId={chapterId}
              pendingCount={pendingCards}
            />
            {chapter.deckId && Number(deckCards?.n ?? 0) > 0 && (
              <Link
                href={`/srs/${chapter.deckId}`}
                className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                Deck ({Number(deckCards.n)})
              </Link>
            )}
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-gray-400">No sections imported yet.</p>
      ) : (
        <div className="space-y-8">
          {sections.map(section => {
            const sectionProblems = problemsBySection.get(section.id) ?? []
            return (
              <div key={section.id}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-gray-400">{section.number}</span>
                    {section.title}
                  </h2>
                  <EnrichButton
                    bookId={bookId}
                    chapterId={chapterId}
                    sectionId={section.id}
                    unenrichedCount={unenrichedBySec[section.id] ?? 0}
                  />
                </div>

                {sectionProblems.length === 0 ? (
                  <p className="text-sm text-gray-300 pl-2">No problems in this section.</p>
                ) : (
                  <ul className="space-y-2">
                    {sectionProblems.map(problem => {
                      const outcome = outcomeMap[problem.id]
                      const enriched = !!problem.trick

                      return (
                        <li key={problem.id}>
                          <Link
                            href={`/courses/${bookId}/${chapterId}/${problem.id}`}
                            className="flex items-start gap-3 border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                          >
                            {/* Status dot */}
                            <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              outcome === 'solved'
                                ? 'bg-green-400 border-green-400'
                                : outcome === 'gave_up'
                                ? 'bg-amber-300 border-amber-300'
                                : 'bg-white border-gray-300'
                            }`}>
                              {outcome === 'solved' && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-700 transition-colors">
                                  {problem.isStarred ? '★ ' : ''}{problem.number}.
                                </span>
                                <span className="text-sm text-gray-600 truncate">
                                  {problem.statement}
                                </span>
                              </div>
                              {problem.situation && (
                                <p className="text-xs text-indigo-500 mt-0.5 truncate">
                                  {problem.situation}
                                </p>
                              )}
                              {problem.techniqueTags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {problem.techniqueTags.map(tag => (
                                    <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                      {tag.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {!enriched && (
                              <span className="shrink-0 text-xs text-gray-300 self-center">needs enrichment</span>
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
