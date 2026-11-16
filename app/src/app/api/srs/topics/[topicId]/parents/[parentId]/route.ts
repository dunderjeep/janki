import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicParents } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/srs/topics/[topicId]/parents/[parentId] — remove parent relationship
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string; parentId: string }> },
) {
  const { topicId, parentId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  // Verify topic ownership
  const [topic] = await db.select({ id: srsTopics.id }).from(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  await db.delete(srsTopicParents)
    .where(and(eq(srsTopicParents.topicId, topicId), eq(srsTopicParents.parentId, parentId)))

  return NextResponse.json({ ok: true })
}
