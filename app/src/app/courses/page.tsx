import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks, courseChapters, courseProblems, courseSections } from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { ImportForm } from './ImportForm'

export const metadata = { title: 'Courses' }

export default async function CoursesPage() {
  const session = await auth()
  const uid = session!.user.id

  const books = await db
    .select({
      id:        courseBooks.id,
      title:     courseBooks.title,
      author:    courseBooks.author,
      edition:   courseBooks.edition,
      createdAt: courseBooks.createdAt,
    })
    .from(courseBooks)
    .where(eq(courseBooks.ownerUid, uid))
    .orderBy(courseBooks.createdAt)

  // Chapter + problem counts per book
  const chapterCounts = await db
    .select({
      bookId: courseChapters.bookId,
      chapters: sql<number>`count(distinct ${courseChapters.id})`.as('chapters'),
      problems: sql<number>`count(distinct ${courseProblems.id})`.as('problems'),
    })
    .from(courseChapters)
    .leftJoin(courseSections, eq(courseSections.chapterId, courseChapters.id))
    .leftJoin(courseProblems, eq(courseProblems.sectionId, courseSections.id))
    .groupBy(courseChapters.bookId)

  const countMap = Object.fromEntries(chapterCounts.map(c => [c.bookId, c]))

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
        <ImportForm />
      </div>

      {books.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">No books imported yet.</p>
          <p className="text-sm">Import a textbook to get started.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {books.map(book => {
            const counts = countMap[book.id]
            return (
              <li key={book.id}>
                <Link
                  href={`/courses/${book.id}`}
                  className="block border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                        {book.title}
                      </h2>
                      {book.author && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {book.author}{book.edition ? ` — ${book.edition}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-400 shrink-0">
                      <div>{counts?.chapters ?? 0} chapters</div>
                      <div>{counts?.problems ?? 0} problems</div>
                    </div>
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
