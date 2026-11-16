'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatNok, mvaInGross, parseOre } from '@/lib/bokki/money'

type Kind = 'expense' | 'sale' | 'owner_in' | 'owner_out'
type Option = { code: string; name: string; nameEn: string; hint?: string }

const KINDS: { kind: Kind; label: string; help: string }[] = [
  { kind: 'expense', label: 'Expense', help: 'A receipt or invoice for something the business bought.' },
  { kind: 'sale', label: 'Sale', help: 'Money in from selling tarts — a day at a market, a Vipps order.' },
  { kind: 'owner_in', label: 'Put money in', help: 'You moved your own money into the business account or till.' },
  { kind: 'owner_out', label: 'Took money out', help: 'You took business money for yourself (privat uttak). Not an expense.' },
]

const MONEY = [
  { code: '1920', label: 'Business bank / Vipps' },
  { code: '1900', label: 'Cash' },
]
const PRIVATE = { code: '2030', label: 'My own money / private card' }

// Food is 15 % in Norway; most everything else 25 %.
const FOOD_CODES = new Set(['4000'])

/**
 * One voucher at a time, with the double entry it will make shown live
 * underneath. After saving, the form clears but keeps the date, kind and
 * payment method — so a pile of receipts from one shop run goes in quickly.
 */
export function VoucherForm({
  today,
  expenseAccounts,
  incomeAccounts,
  accountNames,
}: {
  today: string
  expenseAccounts: Option[]
  incomeAccounts: Option[]
  accountNames: Record<string, string>
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('expense')
  const [postedOn, setPostedOn] = useState(today)
  const [description, setDescription] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [amount, setAmount] = useState('')
  const [accountCode, setAccountCode] = useState('4000')
  const [moneyCode, setMoneyCode] = useState('2030')
  const [mvaRate, setMvaRate] = useState('15')
  const [mvaText, setMvaText] = useState<string | null>(null) // null = follow the amount
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const previews = useMemo(
    () => files.map((f) => ({ name: f.name, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })),
    [files],
  )
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews])

  const amountOre = (() => {
    try { return amount.trim() ? parseOre(amount) : null } catch { return null }
  })()
  const autoMva = amountOre !== null && mvaRate !== '' ? mvaInGross(amountOre, Number(mvaRate)) : null
  const mvaShown = mvaText ?? (autoMva !== null ? (autoMva / 100).toFixed(2).replace('.', ',') : '')

  function chooseKind(k: Kind) {
    setKind(k)
    setError(null)
    if (k === 'expense') {
      setAccountCode(expenseAccounts[0]?.code ?? '')
      if (moneyCode !== '1920' && moneyCode !== '1900') setMoneyCode(PRIVATE.code)
    } else {
      if (k === 'sale') setAccountCode(incomeAccounts[0]?.code ?? '')
      if (moneyCode === PRIVATE.code) setMoneyCode('1920')
    }
  }

  function chooseCategory(code: string) {
    setAccountCode(code)
    if (kind === 'expense') setMvaRate(FOOD_CODES.has(code) ? '15' : '25')
    setMvaText(null)
  }

  // The two lines this will post — the same mapping the server applies.
  const debitCode = kind === 'expense' ? accountCode : kind === 'owner_out' ? '2040' : moneyCode
  const creditCode = kind === 'expense' ? moneyCode : kind === 'sale' ? accountCode : kind === 'owner_in' ? '2030' : moneyCode

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(null)
    const body = new FormData()
    body.set('kind', kind)
    body.set('postedOn', postedOn)
    body.set('description', description)
    body.set('counterparty', counterparty)
    body.set('amount', amount)
    body.set('accountCode', accountCode)
    body.set('moneyCode', moneyCode)
    if (kind === 'expense') {
      body.set('mvaRate', mvaRate)
      body.set('mva', mvaRate === '' ? '' : mvaShown)
    }
    files.forEach((f) => body.append('receipt', f))
    try {
      const res = await fetch('/api/bokki/vouchers', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSaved(json.voucherNo)
      setDescription('')
      setCounterparty('')
      setAmount('')
      setMvaText(null)
      setFiles([])
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-300'
  const label = 'block text-xs font-medium text-gray-600 mb-1'
  const categories = kind === 'expense' ? expenseAccounts : incomeAccounts
  const hint = categories.find((c) => c.code === accountCode)?.hint

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => chooseKind(k.kind)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              kind === k.kind ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-200 text-gray-600 hover:border-red-300'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500 -mt-3">{KINDS.find((k) => k.kind === kind)!.help}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Date (on the receipt)</label>
          <input type="date" required value={postedOn} onChange={(e) => setPostedOn(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Amount, NOK {kind === 'expense' && '(total incl. MVA)'}</label>
          <input
            required
            inputMode="decimal"
            placeholder="249,90"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setMvaText(null) }}
            className={`${input} tabular-nums ${amount && amountOre === null ? 'border-red-500' : ''}`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <input
            required
            placeholder={kind === 'expense' ? 'Butter, flour, brown sugar for first batch' : kind === 'sale' ? '24 butter tarts, Grünerløkka market' : ''}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={input}
          />
        </div>
        {(kind === 'expense' || kind === 'sale') && (
          <>
            <div>
              <label className={label}>{kind === 'expense' ? 'Supplier (shop)' : 'Customer (optional)'}</label>
              <input
                placeholder={kind === 'expense' ? 'Meny, Rema 1000, Kiwi…' : ''}
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label}>Category</label>
              <select value={accountCode} onChange={(e) => chooseCategory(e.target.value)} className={input}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} {c.nameEn} — {c.name}</option>
                ))}
              </select>
              {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
            </div>
          </>
        )}
        <div>
          <label className={label}>
            {kind === 'expense' || kind === 'owner_out' ? 'Paid with' : 'Received into'}
          </label>
          <select value={moneyCode} onChange={(e) => setMoneyCode(e.target.value)} className={input}>
            {kind === 'expense' && <option value={PRIVATE.code}>{PRIVATE.label}</option>}
            {MONEY.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </div>
        {kind === 'expense' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>MVA rate on receipt</label>
              <select value={mvaRate} onChange={(e) => { setMvaRate(e.target.value); setMvaText(null) }} className={input}>
                <option value="">not shown</option>
                <option value="25">25 % (standard)</option>
                <option value="15">15 % (food)</option>
                <option value="12">12 % (transport)</option>
                <option value="0">0 %</option>
              </select>
            </div>
            <div>
              <label className={label}>MVA amount</label>
              <input
                disabled={mvaRate === ''}
                inputMode="decimal"
                value={mvaShown}
                onChange={(e) => setMvaText(e.target.value)}
                className={`${input} tabular-nums disabled:bg-gray-50`}
              />
            </div>
          </div>
        )}
      </div>

      {(kind === 'expense' || kind === 'sale') && (
        <div>
          <label className={label}>Receipt {kind === 'sale' && '(optional — e.g. a Vipps or SumUp report)'}</label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])}
            className="text-sm"
          />
          {previews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {previews.map((p, i) => (
                <div key={i} className="relative">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.name} className="h-28 w-auto rounded-lg border border-gray-200 object-cover" />
                  ) : (
                    <div className="h-28 w-24 rounded-lg border border-gray-200 flex items-center justify-center text-xs text-gray-500 p-2 text-center break-all">
                      {p.name}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border border-gray-300 text-gray-500 text-xs hover:text-red-600"
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">This will post</p>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="py-0.5 w-16 text-gray-500">Debit</td>
              <td className="py-0.5"><span className="font-mono text-gray-400">{debitCode}</span> {accountNames[debitCode]}</td>
              <td className="py-0.5 text-right tabular-nums">{amountOre !== null ? formatNok(amountOre) : '—'}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-gray-500">Credit</td>
              <td className="py-0.5 pl-6"><span className="font-mono text-gray-400">{creditCode}</span> {accountNames[creditCode]}</td>
              <td className="py-0.5 text-right tabular-nums">{amountOre !== null ? formatNok(amountOre) : '—'}</td>
            </tr>
          </tbody>
        </table>
        {kind === 'expense' && (
          <p className="mt-2 text-xs text-gray-500">
            The whole amount is the cost: not MVA-registered, so the MVA can&apos;t be deducted. It&apos;s
            recorded for the day you register.
          </p>
        )}
        {kind === 'expense' && files.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">No receipt attached — you can add it to the voucher later.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy || amountOre === null}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save voucher'}
        </button>
        {saved !== null && (
          <p className="text-sm text-green-700">
            ✓ Saved as <Link href={`/bokki/bilag/${saved}`} className="underline">voucher #{saved}</Link>. Ready for the next one.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}
