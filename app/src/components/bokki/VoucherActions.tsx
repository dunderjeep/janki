'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AddReceipts({ voucherNo }: { voucherNo: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    const body = new FormData()
    Array.from(files).forEach((f) => body.append('receipt', f))
    try {
      const res = await fetch(`/api/bokki/vouchers/${voucherNo}/receipts`, { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-sm">
      <label className="inline-block cursor-pointer px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:border-red-300">
        {busy ? 'Uploading…' : '+ Attach receipt'}
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
        />
      </label>
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  )
}

/**
 * Nothing in the books is ever edited or deleted. A wrong voucher is cancelled
 * by a reversing one, and then entered again correctly.
 */
export function ReverseVoucher({ voucherNo, today }: { voucherNo: number; today: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [postedOn, setPostedOn] = useState(today)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reverse() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/bokki/vouchers/${voucherNo}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedOn, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      router.push(`/bokki/bilag/${json.voucherNo}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-gray-500 hover:text-red-700 underline">
        Reverse this voucher…
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3 text-sm max-w-lg">
      <p className="text-gray-700">
        Posts a new voucher with every line on the opposite side, so this one nets to zero. Both stay in
        the books. If the amount or category was wrong, enter it again afterwards.
      </p>
      <div className="flex flex-wrap gap-3">
        <input type="date" value={postedOn} onChange={(e) => setPostedOn(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" />
        <input
          placeholder="Reason (e.g. wrong amount)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex-1 min-w-48 rounded-lg border border-gray-300 px-2 py-1"
        />
      </div>
      <div className="flex gap-3">
        <button onClick={reverse} disabled={busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? 'Reversing…' : 'Post reversal'}
        </button>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:underline">Cancel</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}
