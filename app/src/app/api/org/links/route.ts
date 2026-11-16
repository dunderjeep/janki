import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@janki/app-kit/api'
import { labelLink } from 'notes/server'
import { currentDid } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

const ORG_ID = /^[0-9a-fA-F-]{36}$/

/**
 * Draws a labelled link from the canvas: `- label :: [[id:dest][Title]]` in
 * the source note. An existing list-item link gets the label set in place.
 */
export async function POST(req: NextRequest) {
  const did = await currentDid()
  if (!did) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { source, dest, label, title } = await req.json()
  if (typeof source !== 'string' || !ORG_ID.test(source) || typeof dest !== 'string' || !ORG_ID.test(dest)) {
    return NextResponse.json({ error: 'source and dest must be org ids' }, { status: 400 })
  }
  const term = typeof label === 'string' ? label.trim() : ''
  try {
    const outcome = await labelLink(did, source, dest, term, String(title ?? ''))
    return NextResponse.json({ outcome, source, dest, label: term || null })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[org/links]', err)
    return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
  }
}
