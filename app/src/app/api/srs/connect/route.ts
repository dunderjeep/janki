import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { srsDecks, srsCards, srsCardStates, graphEdges } from '@/db/schema/janki'
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const { cardAId, cardBId, connectionText, generate } = await req.json() as {
    cardAId: string
    cardBId: string
    connectionText?: string
    generate?: boolean
  }

  if (!cardAId || !cardBId) {
    return NextResponse.json({ error: 'cardAId and cardBId are required' }, { status: 400 })
  }

  const [cardA] = await db.select().from(srsCards)
    .where(and(eq(srsCards.id, cardAId), eq(srsCards.ownerUid, uid))).limit(1)
  const [cardB] = await db.select().from(srsCards)
    .where(and(eq(srsCards.id, cardBId), eq(srsCards.ownerUid, uid))).limit(1)

  if (!cardA || !cardB) {
    return NextResponse.json({ error: 'One or both cards not found' }, { status: 404 })
  }

  let backText = connectionText?.trim() ?? ''
  let generatedFront: string | null = null

  if (generate || !backText) {
    const prompt = `You are a curious knowledge synthesizer who loves finding surprising, deep, or lateral connections between concepts from entirely different domains.

Card A:
Front: ${cardA.front}
Back: ${cardA.back}

Card B:
Front: ${cardB.front}
Back: ${cardB.back}

Find the most interesting, non-obvious connection between these two concepts. Look for:
- Shared mathematical structure or formal patterns
- One concept as a lens, metaphor, or model for the other
- Common underlying principles that unite them
- Historical, philosophical, or cross-disciplinary links
- Surprising analogies or structural isomorphisms
- Cases where understanding one changes how you see the other

Write a rich connection explanation (3–6 sentences). Prioritize surprising lateral angles over obvious surface similarities. Be specific — avoid vague platitudes like "both involve change" or "both are important".

Respond with ONLY a JSON object (no markdown, no explanation):
{"front": "What connects [concise label A] and [concise label B]?", "back": "...connection explanation..."}`

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const raw = (message.content[0] as { type: 'text'; text: string }).text
        .trim()
        .replace(/^```(?:json)?\n?/i, '')
        .replace(/\n?```$/, '')
        .trim()
      const parsed = JSON.parse(repairLatexJson(raw)) as { front: string; back: string }
      backText = parsed.back
      generatedFront = parsed.front
    } catch (e: any) {
      return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
    }
  }

  // Find or create the "Connections" deck
  const [existingDeck] = await db.select({ id: srsDecks.id })
    .from(srsDecks)
    .where(and(eq(srsDecks.ownerUid, uid), eq(srsDecks.name, 'Connections')))
    .limit(1)

  let deckId = existingDeck?.id
  if (!deckId) {
    deckId = nanoid()
    await db.insert(srsDecks).values({
      id: deckId,
      ownerUid: uid,
      name: 'Connections',
      description: 'Bridge cards linking concepts across decks — lateral thinking & surprising links',
    })
  }

  const labelA = cardA.front.length > 50 ? cardA.front.slice(0, 47) + '…' : cardA.front
  const labelB = cardB.front.length > 50 ? cardB.front.slice(0, 47) + '…' : cardB.front
  const front = generatedFront ?? `What connects "${labelA}" and "${labelB}"?`

  const cardId = nanoid()
  await db.transaction(async (tx) => {
    await tx.insert(srsCards).values({
      id: cardId,
      ownerUid: uid,
      deckId,
      front,
      back: backText,
      tags: ['connection'],
    })
    await tx.insert(srsCardStates).values({
      id: cardId,
      ownerUid: uid,
      deckId,
      srs: newCardState(),
    })
    // Link in Quilt graph if both cards have node IDs
    if (cardA.nodeId && cardB.nodeId) {
      await tx.insert(graphEdges).values({
        ownerUid: uid,
        type: 'RELATED_TO',
        fromNodeId: cardA.nodeId,
        toNodeId: cardB.nodeId,
        props: { connectionCardId: cardId },
      })
    }
  })

  return NextResponse.json({ cardId, deckId, front, back: backText })
}
