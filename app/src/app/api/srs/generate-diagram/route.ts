/**
 * POST /api/srs/generate-diagram
 *
 * Body: { cardId, side: 'front'|'back', instruction?: string }
 *
 * Calls Claude to produce a Mermaid diagram that best visualises the card
 * content, then saves the syntax to the card and returns it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

const SYSTEM = `You are an expert at creating Mermaid diagrams to visualise concepts for spaced-repetition flashcards.

Rules:
- Output ONLY the raw Mermaid syntax, no prose, no code fences, no markdown.
- Choose the diagram type that best fits the content:
  • flowchart TD — for processes, decision trees, cause-effect chains
  • graph LR — for concept maps, hierarchies, networks
  • sequenceDiagram — for protocols, message flows, step sequences
  • classDiagram — for OOP structures, type hierarchies
  • stateDiagram-v2 — for state machines, lifecycle diagrams
  • erDiagram — for data relationships
  • mindmap — for broad topic overviews
  • timeline — for historical sequences
- Keep diagrams concise: ≤ 15 nodes. Label edges clearly.
- Use clean, readable node labels (no LaTeX, no special chars beyond parentheses).
- The diagram must be valid Mermaid syntax that renders without errors.`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    cardId:       string
    side:         'front' | 'back'
    instruction?: string
  }

  if (!body.cardId || !body.side) {
    return NextResponse.json({ error: 'cardId and side required' }, { status: 400 })
  }

  // Fetch card content
  const [card] = await db
    .select({ front: srsCards.front, back: srsCards.back })
    .from(srsCards)
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const userPrompt = [
    `Card front: ${card.front}`,
    `Card back:  ${card.back}`,
    `Attach diagram to: ${body.side} side`,
    body.instruction ? `Extra instruction: ${body.instruction}` : null,
    '',
    'Generate the most insightful Mermaid diagram for this flashcard.',
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1024,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  // Extract text from response
  const rawSyntax = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Strip accidental code fences if Claude included them despite instructions
  const syntax = rawSyntax
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  // Persist to card
  const field = body.side === 'front' ? 'frontDiagram' : 'backDiagram'
  await db
    .update(srsCards)
    .set({ [field]: syntax, updatedAt: new Date() })
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.ownerUid, uid)))

  return NextResponse.json({ syntax, side: body.side })
}
