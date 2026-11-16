import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { listPins } from '@/lib/porcupin/store'

export async function GET(_req: NextRequest) {
  return asUser(async (uid) => ({ pins: await listPins(uid) }))
}
