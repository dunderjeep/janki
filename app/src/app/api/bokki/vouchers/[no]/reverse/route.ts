import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { reverseVoucher } from '@/lib/bokki/vouchers'

/** POST /api/bokki/vouchers/:no/reverse   { postedOn, reason } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ no: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { no } = await params
  const body = (await req.json().catch(() => ({}))) as { postedOn?: string; reason?: string }
  try {
    const voucherNo = await reverseVoucher(session.user.id, Number(no), body.postedOn ?? '', body.reason ?? '')
    return NextResponse.json({ voucherNo })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
