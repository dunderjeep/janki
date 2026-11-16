import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { bokkiReceipts } from '@/db/schema/bokki'
import { readReceipt } from '@/lib/bokki/receipts'

/**
 * GET /api/bokki/receipts/:id — the stored file, to its owner only.
 * ?download=1 sends it as an attachment under its original name.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [r] = await db
    .select()
    .from(bokkiReceipts)
    .where(and(eq(bokkiReceipts.id, id), eq(bokkiReceipts.ownerUid, session.user.id)))
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const bytes = await readReceipt(r.storageKey)
  const disposition = req.nextUrl.searchParams.get('download') ? 'attachment' : 'inline'
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': r.contentType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
      // Receipts never change once filed.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
