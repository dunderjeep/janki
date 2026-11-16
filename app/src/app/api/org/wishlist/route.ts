import { NextRequest, NextResponse } from 'next/server'
import { addWishlistItem, readWishlist } from '@/lib/orgWishlist'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

export async function GET() {
  return notesRoute((did) => readWishlist(did))
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  return notesRoute(async (did) => {
    await addWishlistItem(did, text.trim())
    return readWishlist(did)
  })
}
