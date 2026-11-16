import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { createBoard } from '@/lib/porcupin/store'

export async function POST(req: NextRequest) {
  return asUser(async (uid) => createBoard(uid, (await req.json()).name))
}
