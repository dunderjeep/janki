/**
 * POST /api/srs/generate-math-plot
 *
 * Generates a precise mathematical plot as inline SVG and stores it in
 * frontSvg / backSvg — the same fields used by generate-svg.
 *
 * Specialised system prompt vs generate-svg:
 *   - No element-count cap (smooth curves need 80-200 path points)
 *   - Claude must compute sample values explicitly before drawing
 *   - Proper math coordinate system (Y-axis flipped, origin at lower-left)
 *   - Handles: continuous functions, discrete distributions, shaded integrals,
 *     scatter/point annotations, multi-curve overlays
 *
 * Body: { cardId, side: 'front'|'back', instruction?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db, srsCards } from '@/db'
import { eq, and } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

const SYSTEM = `\
You are a mathematical visualisation engine. Your only output is a single valid SVG element \
that precisely plots the mathematical content of a flashcard.

═══ OUTPUT FORMAT ═══
- Output ONLY raw SVG — no prose, no code fences, no XML declaration, no comments outside the SVG.
- Start with <svg viewBox="0 0 520 340" xmlns="http://www.w3.org/2000/svg"> and end with </svg>.
- Do NOT include fixed width/height attributes — viewBox only, so it scales responsively.

═══ COORDINATE SYSTEM ═══
Use this standard setup inside the SVG so your drawing uses natural math coordinates:

  Margins: left=60, right=20, top=20, bottom=50
  Plot width W = 440, plot height H = 270

  To convert math coords (x_m, y_m) to SVG pixels (x_s, y_s):
    x_s = 60 + (x_m - x_min) / (x_max - x_min) * 440
    y_s = 20 + (1 - (y_m - y_min) / (y_max - y_min)) * 270

  Draw a white plot background rect at (60, 20) size 440×270.
  Draw light grey grid lines at 4-5 evenly spaced intervals on each axis.
  Draw axes as dark lines along the left edge (x=60) and bottom edge (y=290).
  Draw tick marks and numeric labels at each grid interval.
  Label the x-axis at (280, 330) and y-axis (rotated -90°) at (15, 155).
  Title at (280, 12), font-size 11, text-anchor middle, font-style italic.

═══ COMPUTATION REQUIREMENT ═══
Before drawing any curve or bars, you MUST compute the actual numeric values.
Embed them as an SVG comment immediately before the <path> or <rect> elements:
  <!-- computed: x=[0,1,2,...] y=[0.028, 0.121, ...] -->
This ensures accuracy. Do not estimate or approximate — calculate.

Computation helpers you may use:
  C(n,k) = n! / (k! * (n-k)!)          — binomial coefficient
  Binomial PMF: P(k) = C(n,k) * p^k * (1-p)^(n-k)
  Normal PDF: f(x) = exp(-(x-μ)²/(2σ²)) / (σ√(2π))
  Poisson PMF: P(k) = λ^k * e^(-λ) / k!
  For smooth curves: sample at 80-120 evenly spaced x values across the domain.
  For discrete distributions: one bar per integer value.

═══ PLOT TYPES ═══

CONTINUOUS FUNCTION — use a smooth <path> with many points:
  d="M x0,y0 L x1,y1 L x2,y2 ..."  (one point per sample, ≥80 points)
  stroke="#4f46e5" stroke-width="2" fill="none"

DISCRETE DISTRIBUTION — use <rect> bars:
  Each bar centred on its x value, width = 0.7 * bar_spacing_in_pixels
  fill="#6366f1" or gradient from #818cf8 to #4f46e5

SHADED INTEGRAL — draw the function, then fill the area under it:
  First draw a filled <path> from (x_from,y=0) along the function to (x_to,y=0), fill="#a5b4fc88"
  Then draw the function curve on top in solid stroke
  Add a label showing the value of the integral

SCATTER / KEY POINTS — use <circle r="4" fill="#dc2626"/> with <text> labels

MULTI-CURVE — use distinct strokes: #4f46e5 (indigo), #059669 (green), #d97706 (amber)
  Include a small legend in the upper-right corner of the plot area

═══ LABELS & TYPOGRAPHY ═══
  font-family: "Georgia, serif" for math symbols and axis labels
  font-family: "system-ui, sans-serif" for title and annotations
  Key annotations (e.g. μ, σ, inflection points, notable values) as <text> elements
  with a small white rect behind them for legibility — use paint-order trick:
    <text stroke="white" stroke-width="4" paint-order="stroke" fill="#1e293b">label</text>

═══ STYLE ═══
  Background: white (#ffffff)
  Grid: #e2e8f0 (very light grey)
  Axes: #475569
  Tick labels: #64748b, font-size 9
  Primary curve/bars: #4f46e5 (indigo) unless the card content suggests another
  Secondary: #059669 (green)
  Annotation text: #1e293b`

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
    `Attach to: ${body.side} side`,
    body.instruction
      ? `Specific instruction: ${body.instruction}`
      : 'Generate the most informative mathematical plot for this card.',
    '',
    'Remember: compute all values explicitly before drawing. Embed the computed values as a comment.',
  ].filter(Boolean).join('\n')

  let raw = ''
  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 8192,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    })
    raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Claude API error' }, { status: 502 })
  }

  // Strip code fences, then find the first <svg — Claude sometimes emits
  // computation comments or prose before the SVG element itself.
  const stripped = raw
    .replace(/^```(?:svg|xml)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  const svgStart = stripped.indexOf('<svg')
  if (svgStart === -1) {
    return NextResponse.json(
      { error: `No SVG found in response: ${stripped.slice(0, 120)}` },
      { status: 422 },
    )
  }
  const svg = stripped.slice(svgStart)

  const field = body.side === 'front' ? 'frontSvg' : 'backSvg'
  await db
    .update(srsCards)
    .set({ [field]: svg, updatedAt: new Date() })
    .where(and(eq(srsCards.id, body.cardId), eq(srsCards.ownerUid, uid)))

  return NextResponse.json({ svg, side: body.side })
}
