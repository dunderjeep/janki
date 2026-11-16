import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks, courseAnnotations } from '@/db/schema/janki'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { bookId } = await params
  const [book] = await db
    .select({ id: courseBooks.id })
    .from(courseBooks)
    .where(and(eq(courseBooks.id, bookId), eq(courseBooks.ownerUid, uid)))
    .limit(1)
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    blockId: string
    offsetStart: number
    offsetEnd: number
    selectedText: string
    note?: string
    cardId?: string
  }

  const [annotation] = await db.insert(courseAnnotations).values({
    id:           nanoid(),
    ownerUid:     uid,
    blockId:      body.blockId,
    offsetStart:  body.offsetStart,
    offsetEnd:    body.offsetEnd,
    selectedText: body.selectedText,
    note:         body.note ?? '',
    cardId:       body.cardId ?? null,
  }).returning()

  return NextResponse.json(annotation)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { annotationId } = await req.json() as { annotationId: string }

  await db.delete(courseAnnotations).where(
    and(eq(courseAnnotations.id, annotationId), eq(courseAnnotations.ownerUid, uid))
  )

  return NextResponse.json({ ok: true })
}
