import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { compileWork } from '@/lib/scatterbrain/store'

type Ctx = { params: Promise<{ id: string }> }

/** The whole manuscript as one Markdown file. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const { title, markdown } = await compileWork(uid, (await params).id)
    const name = title.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'manuscript'
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.md"`,
      },
    })
  })
}
