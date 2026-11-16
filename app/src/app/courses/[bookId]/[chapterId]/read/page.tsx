import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections,
  courseSectionBlocks, courseAnnotations,
} from '@/db/schema/janki'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReadingView } from './ReadingView'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>
}) {
  const { chapterId } = await params
  const [ch] = await db.select({ title: courseChapters.title, number: courseChapters.number })
    .from(courseChapters).where(eq(courseChapters.id, chapterId))
  return { title: ch ? `Read: Ch. ${ch.number} — ${ch.title}` : 'Read' }
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>
}) {
  const { bookId, chapterId } = await params
  const session = await auth()
  const uid = session!.user.id

  const [book] = await db
    .select({ id: courseBooks.id, title: courseBooks.title, ownerUid: courseBooks.ownerUid })
    .from(courseBooks).where(eq(courseBooks.id, bookId))
  if (!book || book.ownerUid !== uid) notFound()

  const [chapter] = await db.select().from(courseChapters).where(eq(courseChapters.id, chapterId))
  if (!chapter || chapter.bookId !== bookId) notFound()

  const sections = await db
    .select()
    .from(courseSections)
    .where(eq(courseSections.chapterId, chapterId))
    .orderBy(courseSections.sortOrder)

  const sectionIds = sections.map(s => s.id)

  const allBlocks = sectionIds.length > 0
    ? await db.select().from(courseSectionBlocks)
        .where(sql`${courseSectionBlocks.sectionId} = ANY(ARRAY[${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)}]::text[])`)
        .orderBy(courseSectionBlocks.sectionId, courseSectionBlocks.sortOrder)
    : []

  // Fetch annotations once we have block ids
  const blockIds = allBlocks.map(b => b.id)
  const userAnnotations = blockIds.length > 0
    ? await db.select().from(courseAnnotations)
        .where(
          sql`${courseAnnotations.ownerUid} = ${uid} AND ${courseAnnotations.blockId} = ANY(ARRAY[${sql.join(blockIds.map(id => sql`${id}`), sql`, `)}]::text[])`
        )
    : []

  // Group blocks by section
  const blocksBySection = new Map<string, typeof allBlocks>()
  for (const b of allBlocks) {
    if (!blocksBySection.has(b.sectionId)) blocksBySection.set(b.sectionId, [])
    blocksBySection.get(b.sectionId)!.push(b)
  }

  // Group annotations by block
  const annotationsByBlock = new Map<string, typeof userAnnotations>()
  for (const a of userAnnotations) {
    if (!annotationsByBlock.has(a.blockId)) annotationsByBlock.set(a.blockId, [])
    annotationsByBlock.get(a.blockId)!.push(a)
  }

  const sectionsWithBlocks = sections.map(s => ({
    ...s,
    blocks: (blocksBySection.get(s.id) ?? []).map(b => ({
      ...b,
      annotations: annotationsByBlock.get(b.id) ?? [],
    })),
  }))

  const hasContent = sectionsWithBlocks.some(s => s.blocks.length > 0)

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
        <Link href="/courses" className="hover:text-gray-600">Courses</Link>
        <span>/</span>
        <Link href={`/courses/${bookId}`} className="hover:text-gray-600 truncate max-w-[140px]">{book.title}</Link>
        <span>/</span>
        <Link href={`/courses/${bookId}/${chapterId}`} className="hover:text-gray-600">Ch. {chapter.number}</Link>
        <span>/</span>
        <span className="text-gray-600">Read</span>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400 mb-1">Chapter {chapter.number}</p>
          <h1 className="text-2xl font-bold text-gray-900">{chapter.title}</h1>
        </div>
        <Link
          href={`/courses/${bookId}/${chapterId}`}
          className="shrink-0 text-sm text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          Problems →
        </Link>
      </div>

      {!hasContent ? (
        <div className="text-center py-20 text-gray-400 border border-dashed border-gray-200 rounded-xl">
          <p className="mb-2">No reading content imported yet.</p>
          <p className="text-sm">
            Re-import the book from the{' '}
            <Link href="/courses" className="underline hover:text-gray-600">Courses page</Link>
            {' '}to populate reading content.
          </p>
        </div>
      ) : (
        <ReadingView
          sections={sectionsWithBlocks}
          bookId={bookId}
          chapterId={chapterId}
          uid={uid}
        />
      )}
    </main>
  )
}
