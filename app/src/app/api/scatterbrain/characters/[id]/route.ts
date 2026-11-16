import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { deleteCharacter, updateCharacter } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await updateCharacter(uid, (await params).id, await req.json())
    return { ok: true }
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await deleteCharacter(uid, (await params).id)
    return { ok: true }
  })
}
