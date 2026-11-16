import { NextRequest, NextResponse } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { readBody, saveBody } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => readBody(uid, (await params).id))
}

/** 409 means the save was refused and the file is untouched. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const result = await saveBody(uid, (await params).id, await req.json())
    return 'conflict' in result ? NextResponse.json(result, { status: 409 }) : result
  })
}
