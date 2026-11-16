import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { moveItem } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await moveItem(uid, (await params).id, await req.json())
    return { ok: true }
  })
}
