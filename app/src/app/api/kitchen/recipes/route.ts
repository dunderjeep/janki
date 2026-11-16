import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { frontId } from '@/lib/dough/frontFiles'
import { createRecipe, listRecipes } from '@/lib/kitchen/recipes'

export const dynamic = 'force-dynamic'

const frontOf = (req: NextRequest) => {
  const f = req.nextUrl.searchParams.get('front')
  return f ? frontId(f) : null
}

/** ?front=<CHAIN_ID> lists one front's recipes; without it, all of them. */
export function GET(req: NextRequest) {
  return asUser(async (uid) => ({ recipes: await listRecipes(uid, frontOf(req)) }))
}

export function POST(req: NextRequest) {
  return asUser(async (uid) => createRecipe(uid, frontOf(req), (await req.json().catch(() => ({}))) ?? {}))
}
