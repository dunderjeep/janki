import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@janki/app-kit/api'
import { nodeText, setNodeText } from 'notes/server'
import { currentDid, syncNotes } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

const ORG_ID = /^[0-9a-fA-F-]{36}$/

const refusal = (err: unknown) => {
  if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error('[org/node]', err)
  return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
}

/**
 * A note's text for the canvas card: everything under its heading, never its
 * heading line, planning or property drawer, where the ID lives.
 */
export async function GET(req: NextRequest) {
  const did = await currentDid()
  if (!did) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!ORG_ID.test(id)) return NextResponse.json({ error: 'id must be an org id' }, { status: 400 })
  try {
    await syncNotes(did)
    const { text, path } = await nodeText(did, id)
    return NextResponse.json({ text, file: path ?? '', modified: false })
  } catch (err) {
    return refusal(err)
  }
}

/** Saves the card's text, unless the note changed since the card opened (409). */
export async function POST(req: NextRequest) {
  const did = await currentDid()
  if (!did) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, expected, text } = await req.json()
  if (typeof id !== 'string' || !ORG_ID.test(id)) return NextResponse.json({ error: 'id must be an org id' }, { status: 400 })
  if (typeof expected !== 'string' || typeof text !== 'string') {
    return NextResponse.json({ error: 'expected and text are required' }, { status: 400 })
  }
  try {
    return NextResponse.json(await setNodeText(did, id, expected, text))
  } catch (err) {
    return refusal(err)
  }
}
