import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicParents, srsTopicDecks } from '@/db/schema/janki'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const [topics, parents, deckLinks] = await Promise.all([
    db.select().from(srsTopics).where(eq(srsTopics.ownerUid, uid)).orderBy(srsTopics.sortOrder, srsTopics.createdAt),
    db.select().from(srsTopicParents),
    db.select().from(srsTopicDecks),
  ])

  return NextResponse.json({ topics, parents, deckLinks })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const { name, description = '', color, parentId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  // Determine sortOrder = max existing + 1
  const existing = await db.select({ sortOrder: srsTopics.sortOrder }).from(srsTopics).where(eq(srsTopics.ownerUid, uid))
  const sortOrder = existing.length > 0 ? Math.max(...existing.map(t => t.sortOrder)) + 1 : 0

  const id = nanoid()
  const [topic] = await db.insert(srsTopics).values({
    id,
    ownerUid: uid,
    name: name.trim(),
    description: description.trim(),
    color: color ?? null,
    sortOrder,
  }).returning()

  // Optionally link to a parent immediately
  if (parentId) {
    await db.insert(srsTopicParents).values({ topicId: id, parentId }).onConflictDoNothing()
  }

  return NextResponse.json({ topic }, { status: 201 })
}
