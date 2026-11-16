import type { NextRequest } from 'next/server'
import { domainFor } from '@/lib/chains/domains'
import { asUser } from '@/lib/chains/route'
import { applyOp, ChainError, domainView } from '@/lib/chains/store'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ domain: string }> }

async function domainOf(params: Params['params']) {
  const domain = domainFor((await params).domain)
  if (!domain) throw new ChainError('No such domain', 404)
  return domain
}

export function GET(_req: NextRequest, { params }: Params) {
  return asUser(async (uid) => domainView(uid, await domainOf(params)))
}

/** One edit to the domain's outline: add, set, move or delete. */
export function POST(req: NextRequest, { params }: Params) {
  return asUser(async (uid) => {
    const domain = await domainOf(params)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new ChainError('Expected a JSON body')
    return { ok: true, id: await applyOp(uid, domain, body) }
  })
}
