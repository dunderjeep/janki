import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { openImage } from '@/lib/porcupin/images'
import { getPinFile } from '@/lib/porcupin/store'

/** The stored photo, to its owner only. ?size=thumb sends the small copy if there is one. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return asUser(async (uid) => {
    const pin = await getPinFile(uid, (await params).id)
    const useThumb = req.nextUrl.searchParams.get('size') === 'thumb' && pin.thumbKey
    const { stream, length } = await openImage(useThumb ? pin.thumbKey! : pin.storageKey)
    return new Response(stream, {
      headers: {
        // Thumbnails are always made as JPEG.
        'Content-Type': useThumb ? 'image/jpeg' : pin.contentType,
        ...(length ? { 'Content-Length': String(length) } : {}),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(pin.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        // A pin's bytes never change; editing it only changes its words.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  })
}
