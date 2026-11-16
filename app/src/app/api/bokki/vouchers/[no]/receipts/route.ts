import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { receiptFiles } from '@/lib/bokki/receipts'
import { addReceipts } from '@/lib/bokki/vouchers'

/** POST /api/bokki/vouchers/:no/receipts   multipart: receipt (one or more files) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ no: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { no } = await params
  const form = await req.formData()
  try {
    const added = await addReceipts(
      session.user.id,
      Number(no),
      receiptFiles(form),
    )
    return NextResponse.json({ added })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
