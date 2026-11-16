import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { ensureBoard } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => ({ boardId: await ensureBoard(uid, (await params).id) }))
}
