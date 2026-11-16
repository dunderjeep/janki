import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks, courseClarifications } from '@/db/schema/janki'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { bookId } = await params
  const [book] = await db
    .select({ id: courseBooks.id, title: courseBooks.title })
    .from(courseBooks)
    .where(and(eq(courseBooks.id, bookId), eq(courseBooks.ownerUid, uid)))
    .limit(1)
  if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { blockId, contextText, question } = await req.json() as {
    blockId: string
    contextText: string
    question: string
  }

  const prompt = `You are a patient math tutor helping a student read "${book.title}".

The student is reading this passage:
"""
${contextText}
"""

They have a question:
${question}

Give a clear, direct answer in 2-4 sentences. Use plain language. If there's an analogy or concrete example that makes this click, use it. Don't repeat the question back.`

  let answer = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    answer = (message.content[0] as { type: 'text'; text: string }).text.trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  // Persist the clarification (async, don't block response)
  db.insert(courseClarifications).values({
    id:          nanoid(),
    ownerUid:    uid,
    blockId,
    question,
    answer,
    contextText: contextText.slice(0, 500),
  }).catch(() => {})

  return NextResponse.json({ answer })
}
