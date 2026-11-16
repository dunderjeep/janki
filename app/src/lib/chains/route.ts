import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ChainError } from './errors'

/** Runs a route as its signed-in user, turning refusals into their HTTP status. */
export async function asUser(run: (uid: string) => Promise<Response | object>): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await run(session.user.id)
    return result instanceof Response ? result : NextResponse.json(result)
  } catch (err) {
    if (err instanceof ChainError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[chains]', err)
    return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
  }
}

export const today = () => new Date().toLocaleDateString('sv-SE')
/** Today and the time, "YYYY-MM-DD HH:MM": what decides whether a snooze to a time of day is over. */
export const now = () => { const d = new Date(); return `${d.toLocaleDateString('sv-SE')} ${d.toTimeString().slice(0, 5)}` }
