import { NextRequest } from 'next/server'
import { routineHistory } from '@/lib/orgDailies'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const daysParam = Number(req.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined
  return notesRoute((did) => routineHistory(did, days))
}
