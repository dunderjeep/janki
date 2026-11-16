import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { deleteRecipe, getRecipe, updateRecipe } from '@/lib/kitchen/recipes'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => getRecipe(uid, (await params).id))
}

export function PUT(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => updateRecipe(uid, (await params).id, (await req.json().catch(() => ({}))) ?? {}))
}

export function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => deleteRecipe(uid, (await params).id))
}
