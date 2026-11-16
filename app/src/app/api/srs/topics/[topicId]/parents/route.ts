import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicParents } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/srs/topics/[topicId]/parents — add a parent relationship
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const { parentId } = body
  if (!parentId) return NextResponse.json({ error: 'parentId is required' }, { status: 400 })
  if (parentId === topicId) return NextResponse.json({ error: 'Self-loop not allowed' }, { status: 400 })

  // Verify both topics belong to user
  const [child, parent] = await Promise.all([
    db.select({ id: srsTopics.id }).from(srsTopics).where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid))),
    db.select({ id: srsTopics.id }).from(srsTopics).where(and(eq(srsTopics.id, parentId), eq(srsTopics.ownerUid, uid))),
  ])
  if (!child[0]) return NextResponse.json({ error: 'Child topic not found' }, { status: 404 })
  if (!parent[0]) return NextResponse.json({ error: 'Parent topic not found' }, { status: 404 })

  await db.insert(srsTopicParents).values({ topicId, parentId }).onConflictDoNothing()
  return NextResponse.json({ ok: true }, { status: 201 })
}
