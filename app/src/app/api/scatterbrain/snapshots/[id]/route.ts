import { NextRequest, NextResponse } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { restoreSnapshot } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const result = await restoreSnapshot(uid, (await params).id)
    return 'conflict' in result ? NextResponse.json(result, { status: 409 }) : result
  })
}
