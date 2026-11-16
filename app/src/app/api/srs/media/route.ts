/**
 * POST /api/srs/media
 *
 * Accepts multipart/form-data:
 *   file   — the file to upload (image/* or audio/*)
 *   folder — optional storage prefix (default "cards")
 *
 * Returns: { url, key }
 *
 * DELETE /api/srs/media?key=cards/abc.jpg
 * Deletes an object from MinIO (owner-only guard via cardId check not enforced
 * here for simplicity — the key is treated as opaque and only deletable
 * when the caller knows it, i.e. it was returned by a previous upload).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { uploadMedia, deleteMedia } from '@/lib/storage'

const MAX_BYTES = 20 * 1024 * 1024   // 20 MB
const ALLOWED   = /^(image|audio)\//

/**
 * Node 18 has no global `File`, so `x instanceof File` throws a ReferenceError
 * and the whole route 500s with an empty body. Duck-type the FormData entry
 * instead — undici gives us a File-shaped object either way.
 */
type UploadedFile = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

function isUploadedFile(v: FormDataEntryValue | null): v is FormDataEntryValue & UploadedFile {
  return typeof v === 'object' && v !== null && typeof (v as UploadedFile).arrayBuffer === 'function'
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file   = form.get('file')
  const folder = (form.get('folder') as string | null) ?? 'cards'

  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED.test(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}. Allowed: image/*, audio/*` },
      { status: 415 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const stored = await uploadMedia(buffer, file.name, file.type, folder)

  return NextResponse.json(stored)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  await deleteMedia(key)
  return NextResponse.json({ ok: true })
}
