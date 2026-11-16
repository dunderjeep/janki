import { NextRequest } from 'next/server'
import { fetchRemoteImage } from '@/lib/porcupin/fetchRemote'
import { asUser } from '@/lib/porcupin/route'
import { PorcupinError } from '@/lib/porcupin/store'

/**
 * POST { url } — the image at a link, as bytes.
 *
 * Handed back rather than stored, so a link becomes a pin through the same
 * upload as a dropped file. The browser can only draw a thumbnail of an image
 * it can read, and it cannot read another site's.
 */
export async function POST(req: NextRequest) {
  return asUser(async () => {
    const { url } = await req.json()
    if (typeof url !== 'string' || url.length > 2000) throw new PorcupinError('That is not a valid link')
    const { bytes, contentType, filename, title } = await fetchRemoteImage(url)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'X-Porcupin-Filename': encodeURIComponent(filename),
        ...(title ? { 'X-Porcupin-Title': encodeURIComponent(title) } : {}),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}
