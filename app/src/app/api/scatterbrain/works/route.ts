import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { createWork } from '@/lib/scatterbrain/store'

export async function POST(req: NextRequest) {
  return asUser(async (uid) => createWork(uid, await req.json()))
}
