import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db'
import { ensureChart } from '@/lib/banki/chart'
import { formatCents } from '@/lib/banki/money'
import { generalLedger } from '@/lib/banki/reports'

export const metadata: Metadata = { title: 'General ledger · Banki' }

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>
}) {
  const session = await auth()
  const uid = session!.user.id
  const { account: code = '1000' } = await searchParams

  const chart = await db.transaction((tx) => ensureChart(tx, uid))
  const accounts = [...chart.values()].sort((a, b) => a.code.localeCompare(b.code))
  const account = chart.get(code) ?? accounts[0]
  const rows = await generalLedger(uid, account.id, account.type)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Link
            key={a.id}
            href={`/banki/ledger?account=${a.code}`}
            className={`px-2.5 py-1 rounded-lg text-xs border ${
              a.id === account.id
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-gray-200 text-gray-600 hover:border-green-300'
            }`}
          >
            <span className="font-mono">{a.code}</span> {a.name}
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold">
          <span className="font-mono text-gray-400">{account.code}</span> {account.name}
        </h2>
        <p className="text-sm text-gray-500">
          {account.type} · balance shown as {account.type === 'asset' || account.type === 'expense' ? 'debits − credits' : 'credits − debits'}
          {rows.length > 0 && <> · {rows.length} postings · closing {formatCents(rows.at(-1)!.running)}</>}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No postings to this account yet.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">#</th>
                <th className="px-3 py-2 font-medium">Memo</th>
                <th className="px-3 py-2 font-medium">Other side</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className={r.source === 'statement' ? '' : 'bg-amber-50/50'}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{r.postedOn}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-400">{r.entryNo}</td>
                  <td className="px-3 py-1.5">{r.memo}</td>
                  <td className="px-3 py-1.5 text-gray-500">{r.contra}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.debit ? formatCents(r.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.credit ? formatCents(r.credit) : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCents(r.running)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
