import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { attachPin } from '@/lib/scatterbrain/store'

export async function POST(req: NextRequest) {
  return asUser(async (uid) => attachPin(uid, await req.json()))
}
