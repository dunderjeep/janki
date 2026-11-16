import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

const MAX_CARDS = 200

const SYSTEM_PROMPT = `You are an expert at applying Piotr Woźniak's "20 Rules of Formulating Knowledge" to clean up spaced-repetition flashcard decks.

Your task: analyse ALL cards in the deck and return a single JSON object describing the cleaned-up result.

Rules to apply:
- Rule 1 — Minimum information: each card tests exactly ONE atomic fact. Split any card that tests multiple things.
- Rule 4 — Avoid enumerations: lists on a single card are bad; split into individual items if each is worth knowing.
- Rule 5 — Avoid sets: unordered groups that are hard to recall should be restructured.
- Rule 11 — Optimise wording: shortest, clearest phrasing that still conveys the fact precisely.
- Rule 16 — Provide sources: preserve or add parenthetical citations where relevant.
- Merge near-duplicates: if two cards test essentially the same fact, keep the better-worded one (or a merged version).
- Remove redundant cards: if a card's fact is fully covered by another, remove the weaker one.
- Preserve SRS history: prefer modifying over replacing where the meaning is the same — pass the original "id" in modified cards.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "summary": "one sentence describing what changed and why",
  "kept":     [{ "id": "..." }],
  "modified": [{ "id": "...", "front": "...", "back": "...", "reason": "..." }],
  "added":    [{ "front": "...", "back": "...", "reason": "..." }],
  "removed":  [{ "id": "...", "front": "...", "back": "...", "reason": "..." }]
}

Rules:
- Every original card id must appear in exactly one of: kept, modified, removed.
- "added" cards are brand-new (splits of existing cards or combinations that produce a new angle).
- Reasons should be short (≤ 15 words).`

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ deckId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id
  const { deckId } = await params

  // Verify ownership
  const [deck] = await db
    .select({ id: srsDecks.id, name: srsDecks.name })
    .from(srsDecks)
    .where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid)))
    .limit(1)
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const cards = await db
    .select({ id: srsCards.id, front: srsCards.front, back: srsCards.back, tags: srsCards.tags })
    .from(srsCards)
    .where(eq(srsCards.deckId, deckId))
    .orderBy(srsCards.front)

  if (cards.length === 0) return NextResponse.json({ error: 'Deck has no cards' }, { status: 400 })

  const sample = cards.slice(0, MAX_CARDS)
  const truncated = cards.length > MAX_CARDS

  const cardList = sample
    .map(c => `{"id":"${c.id}","front":${JSON.stringify(c.front)},"back":${JSON.stringify(c.back)}}`)
    .join('\n')

  const userMsg = `Deck: "${deck.name}" (${sample.length} cards${truncated ? ` — showing first ${MAX_CARDS} of ${cards.length}` : ''})\n\nCards:\n${cardList}`

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  // Strip any markdown fences Claude might add
  const jsonStart = raw.indexOf('{')
  const jsonEnd   = raw.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    return NextResponse.json({ error: 'Unexpected response from Claude', raw }, { status: 422 })
  }

  let proposal: {
    summary: string
    kept:     { id: string }[]
    modified: { id: string; front: string; back: string; reason: string }[]
    added:    { front: string; back: string; reason: string }[]
    removed:  { id: string; front: string; back: string; reason: string }[]
  }
  try {
    proposal = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
  } catch {
    return NextResponse.json({ error: 'JSON parse failed', raw }, { status: 422 })
  }

  return NextResponse.json({ ...proposal, truncated, totalCards: cards.length })
}
