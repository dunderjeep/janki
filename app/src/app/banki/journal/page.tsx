import type { Metadata } from 'next'
import { auth } from '@/auth'
import { formatCents } from '@/lib/banki/money'
import { journal } from '@/lib/banki/reports'

export const metadata: Metadata = { title: 'Journal · Banki' }

const LIMIT = 300

export default async function JournalPage() {
  const session = await auth()
  const entries = await journal(session!.user.id, LIMIT)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Every entry in posting order, newest first{entries.length === LIMIT && ` (latest ${LIMIT})`}. Entries are
        never edited — a correction is a new entry that reverses the old one.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-right">#</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
              </tr>
            </thead>
            {entries.map((e) => (
              <tbody key={e.entryNo} className="border-t border-gray-200">
                {e.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1 text-right font-mono text-gray-400">{i === 0 ? e.entryNo : ''}</td>
                    <td className="px-3 py-1 whitespace-nowrap text-gray-500">{i === 0 ? e.postedOn : ''}</td>
                    {/* Credits indented under debits — the way a journal is written by hand. */}
                    <td className={`px-3 py-1 ${l.credit ? 'pl-10' : ''}`}>
                      <span className="font-mono text-gray-400">{l.code}</span> {l.name}
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">{l.debit ? formatCents(l.debit) : ''}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{l.credit ? formatCents(l.credit) : ''}</td>
                  </tr>
                ))}
                <tr>
                  <td />
                  <td />
                  <td colSpan={3} className="px-3 pb-2 text-xs italic text-gray-500">
                    {e.memo}
                    {e.source !== 'statement' && <span className="ml-2 not-italic text-amber-600">{e.source}</span>}
                    {e.reversesNo !== null && <span className="ml-2 not-italic text-amber-600">reverses #{e.reversesNo}</span>}
                  </td>
                </tr>
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  )
}
