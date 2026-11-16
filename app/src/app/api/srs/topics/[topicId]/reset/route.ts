import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicParents, srsTopicDecks, srsCardStates } from '@/db/schema/janki'
import { eq, and, inArray } from 'drizzle-orm'
import { newCardState } from '@/lib/fsrs'

/**
 * POST /api/srs/topics/[topicId]/reset
 *
 * Resets every card in every deck under this topic — including sub-topics —
 * back to "new". The review history in srs_reviews is preserved (for analytics).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { topicId } = await params

  const [topic] = await db
    .select({ id: srsTopics.id })
    .from(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
    .limit(1)

  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  // Own topics only, so a shared parent link can never reach someone else's tree
  const owned = await db
    .select({ id: srsTopics.id })
    .from(srsTopics)
    .where(eq(srsTopics.ownerUid, uid))
  const ownedIds = new Set(owned.map(t => t.id))

  const parents = await db.select().from(srsTopicParents)
  const childMap = new Map<string, string[]>()
  for (const p of parents) {
    if (!ownedIds.has(p.topicId) || !ownedIds.has(p.parentId)) continue
    if (!childMap.has(p.parentId)) childMap.set(p.parentId, [])
    childMap.get(p.parentId)!.push(p.topicId)
  }

  // Topic + all descendants
  const topicIds = new Set<string>([topicId])
  const queue = [topicId]
  while (queue.length) {
    for (const child of childMap.get(queue.shift()!) ?? []) {
      if (!topicIds.has(child)) { topicIds.add(child); queue.push(child) }
    }
  }

  const links = await db
    .select({ deckId: srsTopicDecks.deckId })
    .from(srsTopicDecks)
    .where(inArray(srsTopicDecks.topicId, [...topicIds]))

  const deckIds = [...new Set(links.map(l => l.deckId))]
  if (deckIds.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const reset = await db
    .update(srsCardStates)
    .set({ srs: newCardState(), updatedAt: new Date() })
    .where(and(inArray(srsCardStates.deckId, deckIds), eq(srsCardStates.ownerUid, uid)))
    .returning({ id: srsCardStates.id })

  return NextResponse.json({ ok: true, count: reset.length })
}
