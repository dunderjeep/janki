import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks } from '@/db/schema/janki'
import { nanoid } from 'nanoid'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { name, description } = await req.json() as { name: string; description?: string }
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const id = nanoid()
  const [deck] = await db
    .insert(srsDecks)
    .values({ id, ownerUid: uid, name: name.trim(), description: description?.trim() ?? '' })
    .returning()

  return NextResponse.json({
    deck: { id: deck.id, name: deck.name, description: deck.description, active: deck.active, total: 0, due: 0 },
  }, { status: 201 })
}
