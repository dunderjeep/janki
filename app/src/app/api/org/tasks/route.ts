import { NextRequest, NextResponse } from 'next/server'
import { addTask, tasksList } from '@/lib/orgAgenda'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

/** Every open TODO across the agenda notes. */
export async function GET() {
  return notesRoute(async (did) => ({ tasks: await tasksList(did), available: true }))
}

/** Captures an undated TODO under "Tasks" in the tasks note. */
export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  return notesRoute(async (did) => {
    await addTask(did, text.trim().replace(/[\r\n]+/g, ' '))
    return { tasks: await tasksList(did), available: true }
  })
}
