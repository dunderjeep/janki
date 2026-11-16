import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { deleteTally } from '@/lib/dough/signals'

export const dynamic = 'force-dynamic'

export function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return asUser(async (uid) => {
    await deleteTally(uid, (await params).id)
    return { ok: true }
  })
}
