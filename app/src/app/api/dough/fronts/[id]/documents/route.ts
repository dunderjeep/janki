import type { NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { addDocuments, frontId, listDocuments } from '@/lib/dough/frontFiles'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => ({ documents: await listDocuments(uid, frontId((await params).id)) }))
}

/** multipart/form-data: one or more `file`, and an optional `note`. */
export function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => ({ documents: await addDocuments(uid, frontId((await params).id), await req.formData()) }))
}
