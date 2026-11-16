/**
 * GET /api/courses/epub-image?path=OEBPS/Images/2_1.png&epub=/abs/path/to/book.epub
 *
 * Serves images extracted from an epub file.
 * `path` is the image path inside the epub zip (e.g. OEBPS/Images/ch_1_2.png).
 * `epub` is optional — if omitted we look up the most recently imported epub.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { courseBooks } from '@/db/schema/janki'
import { eq, desc } from 'drizzle-orm'
import { createReadStream } from 'fs'
import AdmZip from 'adm-zip'

const MIME: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  svg:  'image/svg+xml',
  webp: 'image/webp',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 })
  const uid = session.user.id

  const { searchParams } = req.nextUrl
  const imagePath = searchParams.get('path')
  if (!imagePath) return new NextResponse('Missing path', { status: 400 })

  // Resolve epub path: use provided or look up user's latest book
  let epubPath = searchParams.get('epub')
  if (!epubPath) {
    const [book] = await db
      .select({ epubPath: courseBooks.epubPath })
      .from(courseBooks)
      .where(eq(courseBooks.ownerUid, uid))
      .orderBy(desc(courseBooks.createdAt))
      .limit(1)
    epubPath = book?.epubPath ?? null
  }

  if (!epubPath) return new NextResponse('No epub found', { status: 404 })

  try {
    const zip = new AdmZip(epubPath)
    const entry = zip.getEntry(imagePath)
    if (!entry) return new NextResponse('Image not found in epub', { status: 404 })

    const data = entry.getData()
    const ext = imagePath.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = MIME[ext] ?? 'image/png'

    return new NextResponse(data as unknown as BodyInit, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e: any) {
    return new NextResponse(`Error reading epub: ${e.message}`, { status: 500 })
  }
}
