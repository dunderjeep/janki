import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { pinsForNode } from '@/lib/porcupin/store'

/** GET ?graph=&node= — the pins linked to one graph node. */
export async function GET(req: NextRequest) {
  return asUser(async (uid) => {
    const q = req.nextUrl.searchParams
    return { pins: await pinsForNode(uid, q.get('graph'), q.get('node') ?? '') }
  })
}
