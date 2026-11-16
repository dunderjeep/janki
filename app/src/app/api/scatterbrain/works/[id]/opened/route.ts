import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { markOpened } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Recorded by the page once it is really open, so a link prefetch never counts.
 * An optional JSON body `{ itemId?, view? }` also records where you are in it.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown; view?: unknown }
  return asUser(async (uid) => {
    await markOpened(uid, (await params).id, {
      itemId: typeof body.itemId === 'string' ? body.itemId : undefined,
      view: typeof body.view === 'string' ? body.view : undefined,
    })
    return { ok: true }
  })
}
