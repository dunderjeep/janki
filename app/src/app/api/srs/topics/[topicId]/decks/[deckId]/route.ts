import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicDecks } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/srs/topics/[topicId]/decks/[deckId] — remove deck from topic
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string; deckId: string }> },
) {
  const { topicId, deckId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  // Verify topic ownership
  const [topic] = await db.select({ id: srsTopics.id }).from(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  await db.delete(srsTopicDecks)
    .where(and(eq(srsTopicDecks.topicId, topicId), eq(srsTopicDecks.deckId, deckId)))

  return NextResponse.json({ ok: true })
}
