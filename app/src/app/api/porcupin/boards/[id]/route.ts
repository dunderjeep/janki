import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { deleteBoard, renameBoard } from '@/lib/porcupin/store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => renameBoard(uid, (await params).id, (await req.json()).name))
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await deleteBoard(uid, (await params).id)
    return { ok: true }
  })
}
