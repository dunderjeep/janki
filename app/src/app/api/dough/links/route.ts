import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { addLink, listLinks } from '@/lib/dough/links'

export const dynamic = 'force-dynamic'

export function GET() {
  return asUser(async (uid) => ({ links: await listLinks(uid) }))
}

export function POST(req: NextRequest) {
  return asUser(async (uid) => addLink(uid, (await req.json().catch(() => ({}))) ?? {}))
}
