import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsDecks, srsCards, srsCardStates } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import { nanoid } from 'nanoid'
import { newCardState } from '@/lib/fsrs'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { deckId } = await params

  // Verify deck belongs to user
  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const { topic, targetCount = 20 } = await req.json() as {
    topic: string
    targetCount?: number
  }
  if (!topic?.trim()) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

  const prompt = `You are a flashcard creator adding cards to an existing deck called "${deck.name}".

Topic / focus for new cards: ${topic.trim()}
Number of cards to generate: ${Math.min(targetCount, 50)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "cards": [
    {"front": "...", "back": "..."}
  ]
}

Rules:
- Each card tests exactly one fact or concept
- Fronts are questions or prompts; backs are concise answers (1–3 sentences)
- Use LaTeX for math/formulas where appropriate (e.g. $\\frac{a}{b}$)
- Progress from foundational to advanced
- Avoid duplicating obvious basic facts already likely in the deck
- No "What is X?" fronts: avoid open-ended definition prompts — they have non-deterministic answers and become leeches. Instead use cloze-style ("X is defined as ___"), targeted attribute questions ("What property of X makes it Y?"), or reverse-direction prompts`

  let text = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    })
    text = (message.content[0] as { type: 'text'; text: string }).text.trim()
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  let parsed: { cards: { front: string; back: string }[] }
  try {
    parsed = JSON.parse(repairLatexJson(text))
  } catch {
    return NextResponse.json(
      { error: `Could not parse Claude response: ${text.slice(0, 200)}` },
      { status: 422 },
    )
  }

  let cardCount = 0
  await db.transaction(async (tx) => {
    for (const { front, back } of parsed.cards) {
      if (!front?.trim() || !back?.trim()) continue
      const cardId = nanoid()
      await tx.insert(srsCards).values({
        id: cardId,
        ownerUid: uid,
        deckId,
        front: front.trim(),
        back: back.trim(),
      })
      await tx.insert(srsCardStates).values({
        id: cardId,
        ownerUid: uid,
        deckId,
        srs: newCardState(),
      })
      cardCount++
    }
  })

  return NextResponse.json({ cardCount })
}
