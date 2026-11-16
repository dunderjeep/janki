import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

// Same LaTeX-safe JSON repair used by refine-card
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

const SYSTEM_PROMPT = `\
You are an expert at applying Piotr Woźniak's "20 Rules of Formulating Knowledge" \
(SuperMemo, 1999 — supermemo.com/en/blog/twenty-rules-of-formulating-knowledge) \
and Michael Nielsen's principles from "Augmenting Long-term Memory" (2018 — \
augmentingcognition.com/ltm.html).

Your task: decompose one flashcard into the smallest set of atomic cards that together \
cover all the knowledge in the original. Apply these rules strictly:

Rule 1 — Minimum information principle: each card must test exactly one retrievable fact.
Rule 4 — Avoid enumerations: if the back lists multiple items, create one card per item.
Rule 5 — Avoid sets: do not ask the learner to recall an unordered collection.
Rule 11 — Optimise wording: front and back should be the shortest unambiguous phrasing.
Rule 13 — Provide context: include just enough context in the front to uniquely constrain the answer.
Rule 16 — Provide sources: where the fact has a known source (author, book, year, URL), \
include it parenthetically at the end of the back, e.g. (Woźniak, Rule 1, 1999) or \
(Nielsen, Augmenting LTM, 2018). Only cite if you are confident the attribution is correct.
Rule 20 — Redundancy (optional): if a fact is important enough, add a reverse card \
(definition → term) as a second entry — but only when both directions have value.

Output format: ONLY a raw JSON array — no markdown, no explanation, no code fences.
[
  {"front": "...", "back": "..."},
  {"front": "...", "back": "..."}
]

If the original card is already atomic (tests exactly one fact), return an array with \
that single card, optionally with improved wording per Rule 11.
If the original card is entirely unsalvageable (e.g. it is a paragraph of prose with no \
clear Q/A structure), return an empty array [].`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { cardId } = await params

  const [card] = await db
    .select({ id: srsCards.id, front: srsCards.front, back: srsCards.back, tags: srsCards.tags })
    .from(srsCards)
    .where(and(eq(srsCards.id, cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  let text = ''
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Original card:\nFront: ${card.front}\nBack:  ${card.back}`,
      }],
    })
    text = (message.content[0] as { type: 'text'; text: string }).text.trim()
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  let suggestions: { front: string; back: string }[]
  try {
    suggestions = JSON.parse(repairLatexJson(text))
    if (!Array.isArray(suggestions)) throw new Error('Not an array')
  } catch {
    return NextResponse.json(
      { error: `Could not parse Claude response: ${text.slice(0, 200)}` },
      { status: 422 },
    )
  }

  return NextResponse.json({
    original: { front: card.front, back: card.back },
    suggestions,
    // Pass tags through so the UI can carry them to the new cards
    tags: card.tags,
  })
}
