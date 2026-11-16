import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { deleteItem, updateItem } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await updateItem(uid, (await params).id, await req.json())
    return { ok: true }
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await deleteItem(uid, (await params).id)
    return { ok: true }
  })
}
