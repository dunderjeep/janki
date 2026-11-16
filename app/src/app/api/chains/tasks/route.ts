import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { completeTask } from '@/lib/chains/store'

export const dynamic = 'force-dynamic'

/** Ticks off a loose TODO from the agenda files. */
export function POST(req: NextRequest) {
  return asUser(async (uid) => {
    const body = await req.json().catch(() => ({}))
    await completeTask(uid, body.file, Number(body.pos))
    return { ok: true }
  })
}
