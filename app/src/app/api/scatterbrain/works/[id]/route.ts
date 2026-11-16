import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { deleteWork, loadWork, updateWork } from '@/lib/scatterbrain/store'
import { followWorkRename } from '@/lib/chains/docs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => loadWork(uid, (await params).id))
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const id = (await params).id
    const patch = await req.json()
    await updateWork(uid, id, patch)
    // A project's docs work keeps its project in Next under the same name.
    if (typeof patch?.title === 'string' && patch.title.trim()) await followWorkRename(uid, id, patch.title.trim())
    return { ok: true }
  })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    await deleteWork(uid, (await params).id)
    return { ok: true }
  })
}
