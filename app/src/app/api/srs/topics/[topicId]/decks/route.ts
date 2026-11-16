import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicDecks, srsDecks } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/srs/topics/[topicId]/decks — reorder decks within topic
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const { order } = body  // string[] of deckIds in new order
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order must be an array' }, { status: 400 })

  const [topic] = await db.select({ id: srsTopics.id }).from(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  // Update each deck's sort_order
  await Promise.all(order.map((deckId, i) =>
    db.update(srsTopicDecks)
      .set({ sortOrder: i })
      .where(and(eq(srsTopicDecks.topicId, topicId), eq(srsTopicDecks.deckId, deckId)))
  ))

  return NextResponse.json({ ok: true })
}

// POST /api/srs/topics/[topicId]/decks — assign a deck to this topic
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const { deckId } = body
  if (!deckId) return NextResponse.json({ error: 'deckId is required' }, { status: 400 })

  // Verify ownership of both topic and deck
  const [topic] = await db.select({ id: srsTopics.id }).from(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  const [deck] = await db.select({ id: srsDecks.id }).from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  await db.insert(srsTopicDecks).values({ topicId, deckId }).onConflictDoNothing()
  return NextResponse.json({ ok: true }, { status: 201 })
}
