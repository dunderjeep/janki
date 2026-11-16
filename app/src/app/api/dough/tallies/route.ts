import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { addTally } from '@/lib/dough/signals'

export const dynamic = 'force-dynamic'

/** Money in on a front janki has no app for. */
export function POST(req: NextRequest) {
  return asUser(async (uid) => {
    await addTally(uid, (await req.json().catch(() => ({}))) ?? {})
    return { ok: true }
  })
}
