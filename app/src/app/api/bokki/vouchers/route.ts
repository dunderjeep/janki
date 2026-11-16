import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import type { MvaRate } from '@/db/schema/bokki'
import { parseOre } from '@/lib/bokki/money'
import { receiptFiles } from '@/lib/bokki/receipts'
import { createVoucher, type EnteredKind } from '@/lib/bokki/vouchers'

const KINDS: EnteredKind[] = ['expense', 'sale', 'owner_in', 'owner_out']
const RATES: MvaRate[] = [0, 12, 15, 25]

/**
 * POST /api/bokki/vouchers   multipart/form-data
 *
 *   kind          expense | sale | owner_in | owner_out
 *   postedOn      YYYY-MM-DD
 *   description, counterparty
 *   amount        "1 234,50" — the gross total, as on the receipt
 *   accountCode   expense or income account (expense, sale)
 *   moneyCode     1920 bank · 1900 cash · 2030 paid privately (expense only)
 *   mvaRate, mva  optional, as printed on the receipt
 *   receipt       zero or more image / PDF files
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const str = (k: string) => ((form.get(k) as string | null) ?? '').trim()

  try {
    const kind = str('kind') as EnteredKind
    if (!KINDS.includes(kind)) throw new Error(`Unknown kind "${kind}"`)
    const rateText = str('mvaRate')
    const mvaRate = rateText === '' ? null : (Number(rateText) as MvaRate)
    if (mvaRate !== null && !RATES.includes(mvaRate)) throw new Error(`MVA rate must be one of ${RATES.join(', ')}`)

    const voucherNo = await createVoucher(
      session.user.id,
      {
        kind,
        postedOn: str('postedOn'),
        description: str('description'),
        counterparty: str('counterparty') || null,
        amountOre: parseOre(str('amount')),
        accountCode: str('accountCode') || null,
        moneyCode: str('moneyCode'),
        mvaRate,
        mvaOre: kind === 'expense' && mvaRate !== null && str('mva') !== '' ? parseOre(str('mva')) : null,
      },
      receiptFiles(form),
    )
    return NextResponse.json({ voucherNo })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
