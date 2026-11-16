import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCardStates } from '@/db/schema/janki'
import { eq } from 'drizzle-orm'
import { newCardState } from '@/lib/fsrs'

/**
 * POST /api/srs/reset
 *
 * Resets every card in every deck you own back to "new".
 * The review history in srs_reviews is preserved (for analytics).
 */
export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const reset = await db
    .update(srsCardStates)
    .set({ srs: newCardState(), updatedAt: new Date() })
    .where(eq(srsCardStates.ownerUid, uid))
    .returning({ id: srsCardStates.id })

  return NextResponse.json({ ok: true, count: reset.length })
}
