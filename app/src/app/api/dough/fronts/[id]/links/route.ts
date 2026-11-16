import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { addFrontLink, frontId, listFrontLinks } from '@/lib/dough/frontFiles'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => ({ links: await listFrontLinks(uid, frontId((await params).id)) }))
}

export function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => addFrontLink(uid, frontId((await params).id), (await req.json().catch(() => ({}))) ?? {}))
}
