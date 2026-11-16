import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { importStatementFile } from '@/lib/banki/ledger'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * POST /api/banki/import   multipart/form-data
 *
 *   file         .csv (one bank export) or .ods (one tab per account)
 *   dryRun       "1" → run the whole import, report it, roll it back
 *   accountCode  which account a CSV belongs to, when its name doesn't say
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  // Not `instanceof File`: that global is missing on Node 18.
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 5 MB' }, { status: 400 })
  }

  try {
    const result = await importStatementFile({
      uid: session.user.id,
      filename: (file as File).name ?? 'upload',
      bytes: Buffer.from(await file.arrayBuffer()),
      dryRun: form.get('dryRun') === '1',
      accountCode: (form.get('accountCode') as string | null) || undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
