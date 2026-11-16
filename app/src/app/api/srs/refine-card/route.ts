import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

/**
 * Repair JSON that contains unescaped LaTeX backslashes.
 * Claude frequently outputs LaTeX like \frac{} inside JSON strings without
 * doubling the backslash, making JSON.parse fail.
 */
function repairLatexJson(raw: string): string {
  let out = ''
  let i = 0
  while (i < raw.length) {
    if (raw[i] !== '\\') { out += raw[i++]; continue }
    const next = raw[i + 1]
    if (next === '\\' || next === '"') { out += raw[i] + next; i += 2; continue }
    if (next === 'u' && /[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6); i += 6; continue
    }
    out += '\\\\'; i++
  }
  return out
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { cardId, instruction } = await req.json() as {
    cardId: string
    instruction: string
  }

  // Fetch the card (verify ownership)
  const [card] = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const prompt = `You are a flashcard editor. Refine the following flashcard according to the instruction.

Current card:
Front: ${card.front}
Back: ${card.back}
Tags: ${card.tags.join(', ')}
Accepted answers: ${card.accepted.join(', ')}

Instruction: ${instruction}

Respond with ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "front": "...",
  "back": "...",
  "tags": ["..."],
  "accepted": ["..."]
}

Rules:
- Keep LaTeX notation as-is (e.g. $\\frac{a}{b}$)
- Keep the card concise
- Do not add fields beyond the four listed`

  let text = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    text = (message.content[0] as { type: 'text'; text: string }).text.trim()

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  let parsed: { front: string; back: string; tags?: string[]; accepted?: string[] }
  try {
    parsed = JSON.parse(repairLatexJson(text))
  } catch {
    return NextResponse.json(
      { error: `Could not parse Claude response: ${text.slice(0, 200)}` },
      { status: 422 },
    )
  }

  // Save to DB
  const [updated] = await db
    .update(srsCards)
    .set({
      front: parsed.front,
      back: parsed.back,
      tags: parsed.tags ?? card.tags,
      accepted: parsed.accepted ?? card.accepted,
      updatedAt: new Date(),
    })
    .where(eq(srsCards.id, cardId))
    .returning()

  return NextResponse.json({
    front: updated.front,
    back: updated.back,
    tags: updated.tags,
    accepted: updated.accepted,
  })
}
