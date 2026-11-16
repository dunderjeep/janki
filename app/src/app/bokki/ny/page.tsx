import type { Metadata } from 'next'
import { auth } from '@/auth'
import { db } from '@/db'
import { DEFAULT_CHART, ensureChart } from '@/lib/bokki/chart'
import { osloToday } from '@/lib/bokki/reports'
import { VoucherForm } from '@/components/bokki/VoucherForm'

export const metadata: Metadata = { title: 'New voucher · Bokki' }

export default async function NewVoucherPage() {
  const session = await auth()
  const uid = session!.user.id
  const chart = [...(await db.transaction((tx) => ensureChart(tx, uid))).values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  )
  const hints = new Map(DEFAULT_CHART.map((a) => [a.code, a.hint]))
  const option = (a: (typeof chart)[number]) => ({ code: a.code, name: a.name, nameEn: a.nameEn, hint: hints.get(a.code) })

  return (
    <div className="max-w-3xl">
      <VoucherForm
        today={osloToday()}
        expenseAccounts={chart.filter((a) => a.type === 'expense').map(option)}
        incomeAccounts={chart.filter((a) => a.type === 'income').map(option)}
        accountNames={Object.fromEntries(chart.map((a) => [a.code, `${a.nameEn} (${a.name})`]))}
      />
    </div>
  )
}
