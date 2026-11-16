'use client'

import { useState } from 'react'
import type { FsrsParams } from '@/db/schema/janki'

export function DeckSchedulingPanel({
  deckId,
  initial,
}: {
  deckId:  string
  initial: FsrsParams
}) {
  const [open,    setOpen]    = useState(false)
  const [maxDays, setMaxDays] = useState<number | ''>(initial.maxIntervalDays ?? '')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      const fsrsParams: FsrsParams = {
        ...initial,
        maxIntervalDays: maxDays === '' ? undefined : Number(maxDays),
      }
      const res = await fetch(`/api/srs/decks/${deckId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fsrsParams }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMsg('Saved.')
    } catch (e: unknown) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100
                   text-sm font-medium text-gray-600 transition-colors"
      >
        <span>⚙ Scheduling settings</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 py-4 bg-white flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Max interval (days)
            </label>
            <p className="text-xs text-gray-400">
              Cap how far out a card can be pushed. Leave blank for no cap (FSRS default).
              Set to e.g. <strong>21</strong> to stop cards drifting to 78+ day intervals.
            </p>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                min={1}
                max={3650}
                value={maxDays}
                placeholder="No cap"
                onChange={e => setMaxDays(e.target.value === '' ? '' : Math.max(1, +e.target.value))}
                className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400
                           [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                           [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={save}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                           text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {msg && (
                <span className={`text-sm ${msg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                  {msg}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
