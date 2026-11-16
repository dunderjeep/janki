import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks, courseChapters, courseSections, courseProblems } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export async function generateMetadata({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params
  const [book] = await db.select({ title: courseBooks.title }).from(courseBooks).where(eq(courseBooks.id, bookId))
  return { title: book?.title ?? 'Course' }
}

export default async function BookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [book] = await db
    .select()
    .from(courseBooks)
    .where(eq(courseBooks.id, bookId))

  if (!book || book.ownerUid !== uid) notFound()

  const chapters = await db
    .select()
    .from(courseChapters)
    .where(eq(courseChapters.bookId, bookId))
    .orderBy(courseChapters.number)

  // Problem counts per chapter
  const problemCounts = await db
    .select({
      chapterId: courseChapters.id,
      total:    sql<number>`count(distinct ${courseProblems.id})`.as('total'),
      enriched: sql<number>`count(distinct ${courseProblems.id}) filter (where ${courseProblems.trick} is not null)`.as('enriched'),
    })
    .from(courseChapters)
    .leftJoin(courseSections, eq(courseSections.chapterId, courseChapters.id))
    .leftJoin(courseProblems, eq(courseProblems.sectionId, courseSections.id))
    .where(eq(courseChapters.bookId, bookId))
    .groupBy(courseChapters.id)

  const countMap = Object.fromEntries(problemCounts.map(c => [c.chapterId, c]))

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/courses" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← All courses
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{book.title}</h1>
        {book.author && (
          <p className="text-gray-500 mt-1">{book.author}{book.edition ? ` — ${book.edition}` : ''}</p>
        )}
      </div>

      {chapters.length === 0 ? (
        <p className="text-gray-400">No chapters imported yet.</p>
      ) : (
        <ul className="space-y-2">
          {chapters.map(ch => {
            const counts = countMap[ch.id]
            const total    = Number(counts?.total ?? 0)
            const enriched = Number(counts?.enriched ?? 0)
            const pct = total > 0 ? Math.round((enriched / total) * 100) : 0

            return (
              <li key={ch.id}>
                <Link
                  href={`/courses/${bookId}/${ch.id}`}
                  className="flex items-center justify-between border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Mastery badge */}
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      ch.masteryUnlocked
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      {ch.masteryUnlocked ? '✓' : ch.number}
                    </span>
                    <span className="font-medium text-gray-900 group-hover:text-indigo-700 truncate transition-colors">
                      {ch.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    {total > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{enriched}/{total} enriched</div>
                        <div className="mt-1 h-1 w-20 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {total === 0 && (
                      <span className="text-xs text-gray-300">no problems</span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
