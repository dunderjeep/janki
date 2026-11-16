import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { deleteFrontLink } from '@/lib/dough/frontFiles'

export const dynamic = 'force-dynamic'

export function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return asUser(async (uid) => deleteFrontLink(uid, (await params).id))
}
