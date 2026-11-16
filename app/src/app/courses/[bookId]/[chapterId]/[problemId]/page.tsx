import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections, courseProblems,
} from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProblemView } from './ProblemView'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string; problemId: string }>
}) {
  const { problemId } = await params
  const [p] = await db
    .select({ number: courseProblems.number })
    .from(courseProblems)
    .where(eq(courseProblems.id, problemId))
  return { title: p ? `Problem ${p.number}` : 'Problem' }
}

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string; problemId: string }>
}) {
  const { bookId, chapterId, problemId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [book] = await db
    .select({ id: courseBooks.id, title: courseBooks.title, ownerUid: courseBooks.ownerUid })
    .from(courseBooks)
    .where(eq(courseBooks.id, bookId))
  if (!book || book.ownerUid !== uid) notFound()

  const [chapter] = await db
    .select({ id: courseChapters.id, number: courseChapters.number, title: courseChapters.title })
    .from(courseChapters)
    .where(eq(courseChapters.id, chapterId))
  if (!chapter) notFound()

  const [problem] = await db
    .select()
    .from(courseProblems)
    .where(eq(courseProblems.id, problemId))
  if (!problem) notFound()

  const [section] = await db
    .select({ number: courseSections.number, title: courseSections.title })
    .from(courseSections)
    .where(eq(courseSections.id, problem.sectionId))

  // Prev / next problems in the same section for navigation
  const sectionProblems = await db
    .select({ id: courseProblems.id, number: courseProblems.number })
    .from(courseProblems)
    .where(eq(courseProblems.sectionId, problem.sectionId))
    .orderBy(courseProblems.number)

  const idx = sectionProblems.findIndex(p => p.id === problemId)
  const prevProblem = idx > 0 ? sectionProblems[idx - 1] : null
  const nextProblem = idx < sectionProblems.length - 1 ? sectionProblems[idx + 1] : null

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/courses" className="hover:text-gray-600">Courses</Link>
        <span>/</span>
        <Link href={`/courses/${bookId}`} className="hover:text-gray-600 truncate max-w-[160px]">{book.title}</Link>
        <span>/</span>
        <Link href={`/courses/${bookId}/${chapterId}`} className="hover:text-gray-600">
          Ch. {chapter.number}
        </Link>
        <span>/</span>
        <span className="text-gray-600">
          {section?.number} — Problem {problem.number}
        </span>
      </div>

      <ProblemView
        problem={problem}
        sectionTitle={section?.title ?? ''}
        chapterTitle={chapter.title}
        bookId={bookId}
        chapterId={chapterId}
        uid={uid}
      />

      {/* Prev / next navigation */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t border-gray-100">
        {prevProblem ? (
          <Link
            href={`/courses/${bookId}/${chapterId}/${prevProblem.id}`}
            className="text-sm text-gray-400 hover:text-indigo-600 transition-colors"
          >
            ← Problem {prevProblem.number}
          </Link>
        ) : <span />}
        {nextProblem ? (
          <Link
            href={`/courses/${bookId}/${chapterId}/${nextProblem.id}`}
            className="text-sm text-gray-400 hover:text-indigo-600 transition-colors"
          >
            Problem {nextProblem.number} →
          </Link>
        ) : <span />}
      </div>
    </main>
  )
}
