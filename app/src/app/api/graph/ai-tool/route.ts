import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.JANKI_ANTHROPIC_KEY })

const TOOL_PROMPTS: Record<string, string> = {
  PMI: 'Apply the PMI thinking tool (Plus/Minus/Interesting) to the following concept. List the Plus points (benefits/positives), Minus points (drawbacks/negatives), and Interesting points (thought-provoking implications that are neither good nor bad). Be concise and practical.',
  CAF: 'Apply the CAF thinking tool (Consider All Factors) to the following concept. List every relevant factor, stakeholder, constraint, and consideration that should be taken into account before making any decision about this. Be comprehensive.',
  'C&S': 'Apply the C&S thinking tool (Consequences and Sequel) to the following concept. Identify the short-term consequences (immediate, within days/weeks), medium-term consequences (months), and long-term consequences (years/decades). Consider both intended and unintended effects.',
  FIP: 'Apply the FIP thinking tool (First Important Priorities) to the following concept. Rank and explain the most critical factors or actions in order of importance. Explain why each is a priority.',
  APC: 'Apply the APC thinking tool (Alternatives, Possibilities, Choices) to the following concept. What are all the alternative approaches, possibilities, and choices available? Think creatively and broadly.',
  OPV: "Apply the OPV thinking tool (Other Points of View) to the following concept. Consider the perspectives of all relevant stakeholders, groups, and individuals who would have an interest in or be affected by this. What would each see differently?",
  AGO: 'Apply the AGO thinking tool (Aims, Goals, Objectives) to the following concept. What are the underlying aims (broad long-term direction), goals (specific targets), and objectives (measurable outcomes) that are relevant here? Help clarify intent.',
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { nodeId?: string; toolId?: string; label?: string; props?: unknown }
  const { toolId, label, props } = body

  const prompt = TOOL_PROMPTS[toolId ?? '']
  if (!prompt) return NextResponse.json({ error: 'Unknown tool' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'Missing label' }, { status: 400 })

  const userContent = `${prompt}\n\nConcept: "${label}"\nProperties: ${JSON.stringify(props, null, 2)}`

  // Return a streaming text response using Anthropic streaming
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: userContent }],
        })
        for await (const chunk of anthropicStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text))
          }
        }
      } catch (err) {
        controller.enqueue(new TextEncoder().encode(`\n\nError: ${String(err)}`))
      } finally {
        controller.close()
      }
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
