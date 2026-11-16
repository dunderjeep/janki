'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ImportResult, SheetResult } from '@/lib/banki/ledger'
import { formatCents } from '@/lib/banki/money'

/**
 * Pick a file → Preview (the full import, rolled back) → Import.
 * The preview and the import run the same code, so what the preview says is
 * what the import will do.
 */
export function ImportPanel({ statementAccounts }: { statementAccounts: { code: string; name: string }[] }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [accountCode, setAccountCode] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCsv = !!file?.name.toLowerCase().endsWith('.csv')
  const newRows = result?.sheets.reduce((s, r) => s + r.rowsNew, 0) ?? 0

  async function send(dryRun: boolean) {
    if (!file) return
    setBusy(true)
    setError(null)
    const body = new FormData()
    body.set('file', file)
    body.set('dryRun', dryRun ? '1' : '0')
    if (isCsv && accountCode) body.set('accountCode', accountCode)
    try {
      const res = await fetch('/api/banki/import', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setResult(json)
      if (!dryRun) router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-green-200 bg-green-50/40 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Import statements</h2>
        <p className="text-sm text-gray-600">
          A bank <code>.csv</code> export, or an <code>.ods</code> with one tab per account (tabs named for
          the account: “TD Personal Chequing”, “TD Visa”, “PC Mastercard”). Rows you already have are
          skipped, so overlapping exports are safe to bring in again.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.ods"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
            setError(null)
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:shadow-sm file:ring-1 file:ring-gray-200"
        />
        {isCsv && (
          <select
            value={accountCode}
            onChange={(e) => { setAccountCode(e.target.value); setResult(null) }}
            className="text-sm rounded-lg border-gray-200 py-1.5"
          >
            <option value="">Account: detect from file</option>
            {statementAccounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} {a.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => send(true)}
          disabled={!file || busy}
          className="px-3 py-1.5 rounded-lg text-sm bg-white ring-1 ring-gray-300 hover:ring-green-500 disabled:opacity-40"
        >
          Preview
        </button>
        {result?.dryRun && (
          <button
            onClick={() => send(false)}
            disabled={busy || newRows === 0}
            className="px-3 py-1.5 rounded-lg text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
          >
            Import {newRows} new {newRows === 1 ? 'row' : 'rows'}
          </button>
        )}
        {busy && <span className="text-sm text-gray-500">Working…</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className={`text-sm font-medium ${result.dryRun ? 'text-gray-700' : 'text-green-700'}`}>
            {result.dryRun ? 'Preview — nothing saved yet' : '✓ Imported and posted'}
          </p>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Tab</th>
                  <th className="px-3 py-2 font-medium">Into</th>
                  <th className="px-3 py-2 font-medium">Covers</th>
                  <th className="px-3 py-2 font-medium text-right">Rows</th>
                  <th className="px-3 py-2 font-medium text-right">New</th>
                  <th className="px-3 py-2 font-medium text-right">Duplicate</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 align-top">
                {result.sheets.map((s, i) => <SheetRow key={i} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function SheetRow({ s }: { s: SheetResult }) {
  if (!s.account) {
    return (
      <tr className="text-gray-400">
        <td className="px-3 py-2">{s.sheet ?? 'file'}</td>
        <td colSpan={6} className="px-3 py-2">{s.note}</td>
      </tr>
    )
  }
  return (
    <tr>
      <td className="px-3 py-2">{s.sheet ?? 'file'}</td>
      <td className="px-3 py-2"><span className="font-mono text-gray-400">{s.account.code}</span> {s.account.name}</td>
      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{s.firstDate} → {s.lastDate}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.rowsRead}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{s.rowsNew}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.rowsDuplicate}</td>
      <td className="px-3 py-2 space-y-1 text-xs">
        {s.note && <div className="text-gray-500">{s.note}</div>}

        {s.format !== 'pc_mastercard' && (
          s.balanceBreaks.length === 0 ? (
            <div className="text-green-700">✓ every printed running balance follows from the one before</div>
          ) : (
            <details className="text-red-600">
              <summary>✗ {s.balanceBreaks.length} running-balance breaks — rows missing or out of order?</summary>
              <ul className="mt-1 space-y-0.5">
                {s.balanceBreaks.map((b, i) => (
                  <li key={i}>
                    {b.postedOn} {b.description}: expected {formatCents(b.expectedCents)}, printed {formatCents(b.printedCents)}
                  </li>
                ))}
              </ul>
            </details>
          )
        )}

        {s.opening && (
          <div className="text-amber-700">
            Opening balance {formatCents(Math.abs(s.opening.amountCents))}{' '}
            {s.opening.amountCents >= 0 ? 'Dr' : 'Cr'} on {s.opening.postedOn}
            {s.opening.replaced && ' (replaces a later opening, by reversal)'}
          </div>
        )}

        {Object.keys(s.rules).length > 0 && (
          <details>
            <summary className="text-gray-600 cursor-pointer">How the new rows post</summary>
            <ul className="mt-1 space-y-0.5 text-gray-600">
              {Object.entries(s.rules).map(([rule, n]) => <li key={rule}>{n} × {rule}</li>)}
            </ul>
          </details>
        )}

        {s.skipped.length > 0 && (
          <details>
            <summary className="text-gray-500 cursor-pointer">{s.skipped.length} rows skipped</summary>
            <ul className="mt-1 space-y-0.5 text-gray-500">
              {s.skipped.map((k, i) => (
                <li key={i}>row {k.row}: {k.reason} — <span className="font-mono">{k.raw.join(' | ')}</span></li>
              ))}
            </ul>
          </details>
        )}
      </td>
    </tr>
  )
}
