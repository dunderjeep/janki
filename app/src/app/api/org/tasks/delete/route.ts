import { NextRequest, NextResponse } from 'next/server'
import { deleteTask, tasksList } from '@/lib/orgAgenda'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

/** Deletes a task and everything under it: { file, pos, heading? }. */
export async function POST(req: NextRequest) {
  const { file, pos, heading } = await req.json()
  if (typeof file !== 'string' || !Number.isInteger(pos)) return NextResponse.json({ error: 'file and pos are required' }, { status: 400 })
  return notesRoute(async (did) => {
    await deleteTask(did, file, pos, typeof heading === 'string' ? heading : undefined)
    return { tasks: await tasksList(did), available: true }
  })
}
