import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { formatNok } from '@/lib/bokki/money'
import { KIND_LABEL, listVouchers, osloToday } from '@/lib/bokki/reports'

export const metadata: Metadata = { title: 'Vouchers · Bokki' }

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; account?: string }>
}) {
  const session = await auth()
  const uid = session!.user.id
  const params = await searchParams
  const year = Number(params.year) || Number(osloToday().slice(0, 4))
  const vouchers = await listVouchers(uid, { year, accountCode: params.account })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Vouchers {year}
          {params.account && (
            <span className="text-gray-500 font-normal">
              {' '}touching account {params.account} ·{' '}
              <Link href={`/bokki/bilag?year=${year}`} className="text-sm underline">show all</Link>
            </span>
          )}
        </h2>
        <div className="flex gap-3 text-sm text-gray-500">
          <Link href={`/bokki/bilag?year=${year - 1}`} className="hover:underline">← {year - 1}</Link>
          <Link href={`/bokki/bilag?year=${year + 1}`} className="hover:underline">{year + 1} →</Link>
        </div>
      </div>

      {vouchers.length === 0 ? (
        <p className="text-sm text-gray-500">
          No vouchers in {year}. <Link href="/bokki/ny" className="underline">Enter the first one.</Link>
        </p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-right">#</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Debit → credit</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vouchers.map((v) => {
                const struck = v.reversedByNo !== null || v.kind === 'reversal'
                return (
                  <tr key={v.voucherNo} className={`hover:bg-gray-50 ${struck ? 'text-gray-400' : ''}`}>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">
                      <Link href={`/bokki/bilag/${v.voucherNo}`} className="hover:underline">{v.voucherNo}</Link>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{v.postedOn}</td>
                    <td className="px-3 py-1.5">{KIND_LABEL[v.kind]}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/bokki/bilag/${v.voucherNo}`} className={`hover:underline ${v.reversedByNo ? 'line-through' : ''}`}>
                        {v.description}
                      </Link>
                      {v.counterparty && <span className="text-gray-400"> · {v.counterparty}</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {v.lines.filter((l) => l.debit).map((l) => l.code).join(',')} →{' '}
                      {v.lines.filter((l) => l.credit).map((l) => l.code).join(',')}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{formatNok(v.amount)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {v.receipts.length > 0 ? (
                        <span className="text-green-700">📎 {v.receipts.length}</span>
                      ) : v.kind === 'expense' && !v.reversedByNo ? (
                        <span className="text-amber-600">missing</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
