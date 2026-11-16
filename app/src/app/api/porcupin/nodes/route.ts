import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { searchNodes } from '@/lib/porcupin/store'

/** GET ?q= — nodes from the Focus and Quilt graphs whose title matches. */
export async function GET(req: NextRequest) {
  return asUser(async (uid) => {
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    return q ? searchNodes(uid, q) : { hits: [], focusAvailable: true }
  })
}
