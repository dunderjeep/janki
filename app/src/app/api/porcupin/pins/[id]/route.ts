import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { deletePin, updatePin } from '@/lib/porcupin/store'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH { title?, description?, addBoard?, removeBoard? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => updatePin(uid, (await params).id, await req.json()))
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await deletePin(uid, (await params).id)
    return { ok: true }
  })
}
