import { NextRequest, NextResponse } from 'next/server'
import { readWishlist, setWishlistItem } from '@/lib/orgWishlist'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { line, raw, want } = await req.json()
  if (!Number.isInteger(line) || line < 1 || typeof raw !== 'string' || !raw) {
    return NextResponse.json({ error: 'line and raw are required' }, { status: 400 })
  }
  if (want !== 'done' && want !== 'open') return NextResponse.json({ error: 'want must be "done" or "open"' }, { status: 400 })
  return notesRoute(async (did) => {
    await setWishlistItem(did, line, raw, want)
    return readWishlist(did)
  })
}
