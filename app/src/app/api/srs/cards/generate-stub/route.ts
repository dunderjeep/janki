/**
 * POST /api/srs/cards/generate-stub
 *
 * Claude generates a precise atomic flashcard for an unknown term encountered
 * inline (via [[wikilinks]]). Uses Haiku for speed.
 *
 * Body: { term: string, deckId: string, context?: string }
 *   context — the front/back text of the card the link was found in, so Claude
 *             can infer the domain and depth level.
 *
 * Response: { card: { id, front, back, deckId } }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsCards, srsCardStates, srsDecks } from '@/db/schema/janki'
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
    if (next === 'u' && /[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) { out += raw.slice(i, i + 6); i += 6; continue }
    out += '\\\\'; i++
  }
  return out
}

const SYSTEM = `\
You are generating a single atomic flashcard for a concept the learner has flagged as unknown.
Apply Woźniak's Rule 1 (minimum information) and Rule 16 (provide source).

The learner encountered this term while studying another card. Your job is to define it
precisely at the right depth for someone who already understands the parent concept.

Output ONLY a JSON object — no markdown, no explanation:
{"front": "...", "back": "..."}

Rules:
- front: one concise question that uniquely identifies the concept (10–15 words max)
- back: one precise answer (1–2 sentences), ending with a parenthetical citation if applicable
  e.g. (Weinberg, QFT Vol.2, 1996) or (Evans, DDD, 2003)
- Keep LaTeX notation as-is where relevant: $F_{\\mu\\nu}$, $\\nabla$, etc.
- Do NOT add fields beyond front and back`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { term, deckId, context } = await req.json() as {
    term:      string
    deckId:    string
    context?:  string
  }

  if (!term || !deckId) return NextResponse.json({ error: 'term and deckId required' }, { status: 400 })

  // Verify deck ownership
  const [deck] = await db.select({ id: srsDecks.id })
    .from(srsDecks).where(and(eq(srsDecks.id, deckId), eq(srsDecks.ownerUid, uid))).limit(1)
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

  const userPrompt = [
    `Term to define: "${term}"`,
    context ? `Context (the card where this term appeared):\n${context}` : null,
    'Generate the atomic flashcard.',
  ].filter(Boolean).join('\n\n')

  let parsed: { front: string; back: string }
  try {
    const msg = await client.messages.create({
      model:    'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:   SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const raw = (msg.content[0] as { type: 'text'; text: string }).text
      .trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(repairLatexJson(raw))
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude error' }, { status: 502 })
  }

  const id = nanoid()
  await db.transaction(async tx => {
    await tx.insert(srsCards).values({
      id, deckId, ownerUid: uid,
      front: parsed.front, back: parsed.back,
      tags: ['stub', 'wikilink'],
    })
    await tx.insert(srsCardStates).values({
      id, deckId, ownerUid: uid, srs: newCardState(),
    })
  })

  return NextResponse.json({
    card: { id, front: parsed.front, back: parsed.back, deckId },
  }, { status: 201 })
}
