import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

function repairLatexJson(raw: string): string {
  // Walk char-by-char so that already-valid escape pairs (\\, \", \uXXXX) are
  // treated as atomic units and left alone. Any lone \ (e.g. \frac, \alpha)
  // is doubled. A regex over the whole string would re-process the second \
  // in an already-correct \\ and break it.
  let out = ''
  let i = 0
  while (i < raw.length) {
    if (raw[i] !== '\\') { out += raw[i++]; continue }
    const next = raw[i + 1]
    if (next === '\\' || next === '"') { out += raw[i] + next; i += 2; continue }
    if (next === 'u' && /[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6); i += 6; continue
    }
    out += '\\\\'; i++  // bare backslash (LaTeX etc.) → double it
  }
  return out
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { cardId, instruction, targetCount } = await req.json() as {
    cardId: string
    instruction?: string
    targetCount?: number
  }
  const cardLimit = Math.min(Math.max(1, targetCount ?? 5), 20)

  const [card] = await db
    .select()
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const task = instruction?.trim()
    ? `Instruction: ${instruction.trim()}`
    : `Break the answer down into ${cardLimit} simpler, specific sub-cards that each test one fact.`

  const prompt = `You are an expert flashcard tutor applying Piotr Woźniak's \
"20 Rules of Formulating Knowledge" (SuperMemo, 1999) and Michael Nielsen's principles \
from "Augmenting Long-term Memory" (2018).

Given this source card, generate related breakdown cards.

Source card:
Front: ${card.front}
Back: ${card.back}

${task}

Respond with ONLY a JSON array (no markdown, no explanation):
[{"front": "...", "back": "..."}, ...]

Card design rules (apply strictly):
- Rule 1 — Minimum information: each card tests exactly ONE retrievable fact
- Rule 4 — No enumerations: if a concept has multiple parts, make one card per part
- Rule 5 — No sets: do not ask the learner to recall an unordered collection
- Rule 11 — Optimise wording: front and back are the shortest unambiguous phrasing
- Rule 13 — Provide context: include just enough context in the front to uniquely constrain the answer
- Rule 20 — Redundancy: add a reverse card (definition → term) for important facts when both directions are valuable
- ${cardLimit} cards total
- Preserve any LaTeX notation exactly (e.g. $\\frac{a}{b}$)
- No "What is X?" fronts: avoid open-ended definition prompts — they have non-deterministic answers and become leeches. Instead use cloze-style ("X is defined as ___"), targeted attribute questions ("What property of X makes it Y?"), or reverse-direction prompts`

  let text = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    text = (message.content[0] as { type: 'text'; text: string }).text.trim()
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  try {
    const cards = JSON.parse(repairLatexJson(text)) as { front: string; back: string }[]
    return NextResponse.json({ cards })
  } catch {
    return NextResponse.json(
      { error: `Could not parse Claude response: ${text.slice(0, 200)}` },
      { status: 422 },
    )
  }
}
