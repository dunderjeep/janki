/** The home screen's extras: each app's latest item and waiting count, by href. */
import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { tileExtras } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

/** ?only=/mail,/next asks for just those (the top bar's counts). */
export async function GET(req: NextRequest) {
  const uid = (await auth())?.user?.id
  if (!uid) return NextResponse.json({})
  const only = req.nextUrl.searchParams.get('only')?.split(',').filter(Boolean)
  return NextResponse.json(await tileExtras(uid, only), { headers: { 'Cache-Control': 'no-store' } })
}
