import { NextRequest, NextResponse } from 'next/server'
import { deleteWishlistItem, readWishlist } from '@/lib/orgWishlist'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { line, raw } = await req.json()
  if (!Number.isInteger(line) || line < 1 || typeof raw !== 'string' || !raw) {
    return NextResponse.json({ error: 'line and raw are required' }, { status: 400 })
  }
  return notesRoute(async (did) => {
    await deleteWishlistItem(did, line, raw)
    return readWishlist(did)
  })
}
