import { NextRequest, NextResponse } from 'next/server'
import { createDaily, readDaily, saveDaily, todayString } from '@/lib/orgDailies'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A day's daily as text: ?date=YYYY-MM-DD, today by default. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? todayString()
  if (!DAY.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  return notesRoute((did) => readDaily(did, date))
}

/** Makes a day's daily (today by default) from the template, if it isn't there yet. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const date = typeof body?.date === 'string' ? body.date : todayString()
  if (!DAY.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  return notesRoute(async (did) => ({ ...(await createDaily(did, new Date(), date)), daily: await readDaily(did, date) }))
}

/**
 * Saves the daily from the editor: { date, text, expectedSha, force? }.
 * A daily changed elsewhere since it was loaded comes back as 409, with its text now.
 */
export async function PUT(req: NextRequest) {
  const { date, text, expectedSha, force } = await req.json().catch(() => ({}))
  if (typeof date !== 'string' || !DAY.test(date) || typeof text !== 'string') {
    return NextResponse.json({ error: 'date and text are required' }, { status: 400 })
  }
  if (text.length > 2_000_000) return NextResponse.json({ error: 'That daily is too long to save' }, { status: 413 })
  return notesRoute(async (did) => {
    const r = await saveDaily(did, date, text, typeof expectedSha === 'string' ? expectedSha : null, force === true)
    return r.ok ? r : NextResponse.json({ error: 'This daily changed elsewhere since you opened it', ...r }, { status: 409 })
  })
}
