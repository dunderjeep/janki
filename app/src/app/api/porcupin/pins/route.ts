import { NextRequest } from 'next/server'
import { asUser } from '@/lib/porcupin/route'
import { createPin, PorcupinError } from '@/lib/porcupin/store'

type UploadedFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

/** Duck-typed: Node 18 has no global `File`, so `instanceof File` throws. */
function asFile(v: FormDataEntryValue | null): UploadedFile | null {
  return typeof v === 'object' && v !== null && typeof (v as UploadedFile).arrayBuffer === 'function' && v.size > 0
    ? (v as UploadedFile)
    : null
}

function dimension(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : null
}

function sourceUrl(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string' || !v || v.length > 2000) return null
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol) ? v : null
  } catch {
    return null
  }
}

/** POST /api/porcupin/pins  multipart: image, thumb?, width?, height?, boardId?, sourceUrl?, title? */
export async function POST(req: NextRequest) {
  return asUser(async (uid) => {
    const form = await req.formData()
    const image = asFile(form.get('image'))
    if (!image) throw new PorcupinError('No image in that upload')
    const thumb = asFile(form.get('thumb'))
    const boardId = form.get('boardId')
    const title = form.get('title')

    return createPin(uid, {
      filename: image.name || 'image',
      bytes: Buffer.from(await image.arrayBuffer()),
      thumb: thumb ? Buffer.from(await thumb.arrayBuffer()) : null,
      width: dimension(form.get('width')),
      height: dimension(form.get('height')),
      boardId: typeof boardId === 'string' && boardId ? boardId : null,
      sourceUrl: sourceUrl(form.get('sourceUrl')),
      title: typeof title === 'string' ? title.trim().slice(0, 200) || null : null,
    })
  })
}
