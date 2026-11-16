import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsDecks, srsCards, srsCardStates } from '@/db'
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { topic, targetCount = 20 } = await req.json() as {
    topic: string
    targetCount?: number
  }

  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  const prompt = `You are an expert flashcard deck creator applying Piotr Woźniak's \
"20 Rules of Formulating Knowledge" (SuperMemo, 1999) and Michael Nielsen's principles \
from "Augmenting Long-term Memory" (2018).

Topic: ${topic.trim()}
Number of cards: ${Math.min(targetCount, 50)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "deckName": "...",
  "description": "...",
  "cards": [
    {"front": "...", "back": "..."}
  ]
}

Card design rules (apply strictly):
- Rule 1 — Minimum information: each card tests exactly ONE retrievable fact or concept
- Rule 4 — No enumerations: if a concept has multiple parts, make one card per part
- Rule 5 — No sets: do not ask the learner to recall an unordered collection
- Rule 11 — Optimise wording: front and back are the shortest unambiguous phrasing
- Rule 13 — Provide context: include just enough context in the front to uniquely constrain the answer
- Rule 20 — Redundancy: for important facts add a reverse card (definition → term) when both directions are valuable
- No "What is X?" fronts: avoid open-ended definition prompts — they have non-deterministic answers and become leeches. Instead use cloze-style ("X is defined as ___"), targeted attribute questions ("What property of X makes it Y?"), or reverse-direction prompts

Deck design rules:
- deckName should be concise (3–6 words)
- description should be 1 sentence
- Progress from foundational concepts to advanced
- Aim for breadth: cover all major aspects of the topic
- Use LaTeX for math/formulas where appropriate (e.g. $\\frac{a}{b}$)`

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

  let parsed: { deckName: string; description: string; cards: { front: string; back: string }[] }
  try {
    parsed = JSON.parse(repairLatexJson(text))
  } catch {
    return NextResponse.json(
      { error: `Could not parse Claude response: ${text.slice(0, 200)}` },
      { status: 422 },
    )
  }

  // Persist deck + cards in a transaction
  const deckId = nanoid()
  await db.transaction(async (tx) => {
    await tx.insert(srsDecks).values({
      id: deckId,
      ownerUid: uid,
      name: parsed.deckName,
      description: parsed.description ?? '',
    })

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
    }
  })

  return NextResponse.json({
    deckId,
    deckName: parsed.deckName,
    cardCount: parsed.cards.length,
  })
}
