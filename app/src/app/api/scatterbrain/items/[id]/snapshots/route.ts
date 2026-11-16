import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { listSnapshots, takeSnapshot } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => listSnapshots(uid, (await params).id))
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await takeSnapshot(uid, (await params).id, (await req.json()).label)
    return { ok: true }
  })
}
