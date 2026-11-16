import { NextRequest, NextResponse } from 'next/server'
import { routineToday, setRoutineItem } from '@/lib/orgDailies'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

/**
 * Ticks or unticks an item in today's daily: { line, raw, want }. The intended
 * state is given, not "toggle", so a double click can't undo itself.
 */
export async function POST(req: NextRequest) {
  const { line, raw, want } = await req.json()
  if (!Number.isInteger(line) || line < 1 || typeof raw !== 'string' || !raw) {
    return NextResponse.json({ error: 'line and raw are required' }, { status: 400 })
  }
  if (want !== 'done' && want !== 'open') return NextResponse.json({ error: 'want must be "done" or "open"' }, { status: 400 })
  return notesRoute(async (did) => {
    const before = await routineToday(did)
    if (!before.file) return NextResponse.json({ error: `No daily for ${before.date} yet` }, { status: 404 })
    await setRoutineItem(did, line, raw, want)
    const after = await routineToday(did)
    return { state: want, done: after.done, total: after.total, items: after.items, live: after.live }
  })
}
