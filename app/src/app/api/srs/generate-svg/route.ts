/**
 * POST /api/srs/generate-svg
 *
 * Body: { cardId, side: 'front'|'back', instruction?: string }
 *
 * Calls Claude to produce an inline SVG that visualises the card content,
 * saves it, and returns it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

const SYSTEM = `You are an expert at creating clean, informative SVG diagrams for spaced-repetition flashcards.

Rules:
- Output ONLY the raw SVG markup — no prose, no code fences, no markdown, no XML declaration.
- Start directly with <svg ...> and end with </svg>.
- Use viewBox (e.g. viewBox="0 0 400 300") and NO fixed width/height attributes so it scales responsively.
- Keep it simple and legible: clean shapes, readable text (font-family: sans-serif), good contrast.
- Use SVG primitives: rect, circle, ellipse, line, path, polyline, polygon, text, tspan, g.
- Colours: use a neutral palette — greys, soft blues, greens. Avoid harsh reds unless meaningful.
- Maximum complexity: ~20 elements. Labels should be short (≤ 25 chars).
- The SVG must be valid and render without errors in a browser.
- No <script> tags. No external references (no xlink:href to external URLs).`

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

  const [card] = await db
    .select({ front: srsCards.front, back: srsCards.back })
    .from(srsCards)
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.ownerUid, uid)))
    .limit(1)

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  const userPrompt = [
    `Card front: ${card.front}`,
    `Card back:  ${card.back}`,
    `Attach SVG to: ${body.side} side`,
    body.instruction ? `Extra instruction: ${body.instruction}` : null,
    '',
    'Generate a clean SVG diagram that best visualises this flashcard concept.',
  ].filter(Boolean).join('\n')

  const message = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 2048,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const raw = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  // Strip code fences, then seek to the first <svg in case Claude
  // emits prose or comments before the element.
  const stripped = raw
    .replace(/^```(?:svg|xml)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  const svgStart = stripped.indexOf('<svg')
  const svg = svgStart === -1 ? stripped : stripped.slice(svgStart)

  const field = body.side === 'front' ? 'frontSvg' : 'backSvg'
  await db
    .update(srsCards)
    .set({ [field]: svg, updatedAt: new Date() })
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.ownerUid, uid)))

  return NextResponse.json({ svg, side: body.side })
}
