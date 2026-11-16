import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAllMeta, setMeta } from '@/lib/graphStore'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const meta = await getAllMeta(uid)
  return NextResponse.json(meta)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as { key: string; value: unknown }

  if (!body.key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 })
  }

  await setMeta(uid, body.key, body.value)
  return NextResponse.json({ ok: true })
}
