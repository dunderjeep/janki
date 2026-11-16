import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { createCharacter } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => createCharacter(uid, (await params).id, await req.json()))
}
