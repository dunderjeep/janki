import { NextResponse, type NextRequest } from 'next/server'
import { asUser } from '@/lib/chains/route'
import { deleteDocument, readDocument } from '@/lib/dough/frontFiles'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** The stored file, to its owner only. ?download=1 sends it as an attachment. */
export function GET(req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => {
    const doc = await readDocument(uid, (await params).id)
    const disposition = req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'
    return new NextResponse(Buffer.from(doc.bytes), {
      headers: {
        'Content-Type': doc.contentType,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  })
}

export function DELETE(_req: NextRequest, { params }: Ctx) {
  return asUser(async (uid) => deleteDocument(uid, (await params).id))
}
