import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { deleteLink, nudgeLink, updateLink } from '@/lib/dough/links'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Rename or re-point a link; or { move: -1 | 1 } to shift it along the row. */
export function PATCH(req: NextRequest, { params }: Params) {
  return asUser(async (uid) => {
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) ?? {}
    if (body.move === -1 || body.move === 1) return nudgeLink(uid, id, body.move)
    return updateLink(uid, id, body)
  })
}

export function DELETE(_req: NextRequest, { params }: Params) {
  return asUser(async (uid) => deleteLink(uid, (await params).id))
}
