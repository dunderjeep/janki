import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { formatNok } from '@/lib/bokki/money'
import { getVoucher, KIND_LABEL, osloToday } from '@/lib/bokki/reports'
import { AddReceipts, ReverseVoucher } from '@/components/bokki/VoucherActions'

export async function generateMetadata({ params }: { params: Promise<{ no: string }> }): Promise<Metadata> {
  return { title: `Voucher #${(await params).no} · Bokki` }
}

export default async function VoucherPage({ params }: { params: Promise<{ no: string }> }) {
  const session = await auth()
  const uid = session!.user.id
  const no = Number((await params).no)
  const v = Number.isInteger(no) ? await getVoucher(uid, no) : null
  if (!v) notFound()

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-sm text-gray-500">
          <Link href={`/bokki/bilag?year=${v.postedOn.slice(0, 4)}`} className="hover:underline">← Vouchers</Link>
        </p>
        <h2 className="text-xl font-semibold mt-1">
          <span className="font-mono text-gray-400">#{v.voucherNo}</span> {v.description}
        </h2>
        <p className="text-sm text-gray-500">
          {KIND_LABEL[v.kind]} · {v.postedOn}
          {v.counterparty && <> · {v.counterparty}</>} · {formatNok(v.amount)}
        </p>
        {v.reversedByNo !== null && (
          <p className="mt-2 text-sm text-red-700">
            Reversed by <Link href={`/bokki/bilag/${v.reversedByNo}`} className="underline">voucher #{v.reversedByNo}</Link> — nets to zero.
          </p>
        )}
        {v.reversesNo !== null && (
          <p className="mt-2 text-sm text-gray-600">
            Cancels <Link href={`/bokki/bilag/${v.reversesNo}`} className="underline">voucher #{v.reversesNo}</Link>.
          </p>
        )}
      </div>

      <section>
        <h3 className="font-semibold mb-2">Posting</h3>
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {v.lines.map((l, i) => (
                <tr key={i}>
                  <td className={`px-3 py-1.5 ${l.credit ? 'pl-8' : ''}`}>
                    <span className="font-mono text-gray-400">{l.code}</span> {l.nameEn} <span className="text-gray-400">· {l.name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.debit ? formatNok(l.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.credit ? formatNok(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.mvaRate !== null && (
          <p className="mt-2 text-xs text-gray-500">
            Receipt shows MVA {v.mvaRate} %{v.mvaOre !== null && <> = {formatNok(v.mvaOre)}</>} — recorded, not deducted
            (not MVA-registered).
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400">Entered {new Date(v.createdAt).toLocaleString('en-GB', { timeZone: 'Europe/Oslo' })}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Receipts</h3>
          <AddReceipts voucherNo={v.voucherNo} />
        </div>
        {v.receipts.length === 0 ? (
          <p className={`text-sm ${v.kind === 'expense' ? 'text-amber-600' : 'text-gray-500'}`}>
            No receipt attached{v.kind === 'expense' && ' — an expense needs one'}.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {v.receipts.map((r) => (
              <figure key={r.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {r.contentType.startsWith('image/') ? (
                  <a href={`/api/bokki/receipts/${r.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/bokki/receipts/${r.id}`} alt={r.filename} className="w-full max-h-[32rem] object-contain bg-gray-50" />
                  </a>
                ) : (
                  <a href={`/api/bokki/receipts/${r.id}`} target="_blank" rel="noreferrer" className="block p-6 text-center text-sm underline">
                    📄 {r.filename}
                  </a>
                )}
                <figcaption className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100 flex justify-between gap-2">
                  <span className="truncate">{r.filename} · {(r.sizeBytes / 1024).toFixed(0)} KB</span>
                  <a href={`/api/bokki/receipts/${r.id}?download=1`} className="underline shrink-0">download</a>
                </figcaption>
                <p className="px-3 pb-2 text-[10px] font-mono text-gray-300 truncate" title="SHA-256 of the file as filed">
                  sha256 {r.sha256}
                </p>
              </figure>
            ))}
          </div>
        )}
      </section>

      {v.kind !== 'reversal' && v.reversedByNo === null && (
        <section>
          <ReverseVoucher voucherNo={v.voucherNo} today={osloToday()} />
        </section>
      )}
    </div>
  )
}
