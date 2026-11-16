import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { saveOrder } from '@/lib/chains/store'

export const dynamic = 'force-dynamic'

/** The order you dragged a list of next actions into. */
export function PUT(req: NextRequest) {
  return asUser(async (uid) => {
    const body = await req.json().catch(() => ({}))
    await saveOrder(uid, body.keys)
    return { ok: true }
  })
}
