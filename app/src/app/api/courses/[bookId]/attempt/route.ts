import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks, courseProblemAttempts } from '@/db/schema/janki'
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
    problemId: string
    outcome: 'solved' | 'gave_up'
    revealedAt?: string | null
  }

  await db.insert(courseProblemAttempts).values({
    id:          nanoid(),
    ownerUid:    uid,
    problemId:   body.problemId,
    outcome:     body.outcome,
    revealedAt:  body.revealedAt ? new Date(body.revealedAt) : null,
    completedAt: new Date(),
  })

  return NextResponse.json({ ok: true })
}
