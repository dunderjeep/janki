import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { detachPin, updateAttachment } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await updateAttachment(uid, (await params).id, await req.json())
    return { ok: true }
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await detachPin(uid, (await params).id)
    return { ok: true }
  })
}
