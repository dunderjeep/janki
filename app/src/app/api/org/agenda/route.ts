import { NextRequest, NextResponse } from 'next/server'
import { agendaFiles, agendaFor, setAgendaTodo } from '@/lib/orgAgenda'
import { todayString } from '@/lib/orgDailies'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

/** One day's agenda across the agenda notes. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayString()
  return notesRoute(async (did) => ({ date, entries: await agendaFor(did, date), files: agendaFiles(), available: true }))
}

/** Sets an entry's TODO state: { file, pos, state }. DONE on a repeating task moves it on. */
export async function POST(req: NextRequest) {
  const { file, pos, state } = await req.json()
  if (typeof file !== 'string' || !Number.isInteger(pos) || typeof state !== 'string' || !/^[A-Z]{0,12}$/.test(state)) {
    return NextResponse.json({ error: 'file, pos and state are required' }, { status: 400 })
  }
  return notesRoute(async (did) => ({ state: await setAgendaTodo(did, file, pos, state) }))
}
