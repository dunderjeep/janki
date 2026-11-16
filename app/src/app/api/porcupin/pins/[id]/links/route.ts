import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { linkPin, unlinkPin } from '@/lib/porcupin/store'

type Ctx = { params: Promise<{ id: string }> }

/** POST { graph, nodeId, label } */
export async function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => linkPin(uid, (await params).id, await req.json()))
}

/** DELETE ?graph=&nodeId= */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const q = req.nextUrl.searchParams
    return unlinkPin(uid, (await params).id, q.get('graph'), q.get('nodeId') ?? '')
  })
}
