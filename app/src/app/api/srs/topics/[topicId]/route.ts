import { auth } from '@/auth'
import { db } from '@/db'
import { srsTopics, srsTopicDecks } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json()
  const patch: Record<string, unknown> = { updatedAt: new Date() }

  if (body.name !== undefined)        patch.name        = String(body.name).trim()
  if (body.description !== undefined) patch.description = String(body.description).trim()
  if (body.active !== undefined)      patch.active      = Boolean(body.active)
  if (body.sortOrder !== undefined)   patch.sortOrder   = Number(body.sortOrder)
  if ('color' in body)                patch.color       = body.color ?? null

  const [updated] = await db
    .update(srsTopics)
    .set(patch)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ topic: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  // Cascade handles srs_topic_parents + srs_topic_decks automatically
  const [deleted] = await db
    .delete(srsTopics)
    .where(and(eq(srsTopics.id, topicId), eq(srsTopics.ownerUid, uid)))
    .returning({ id: srsTopics.id })

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
