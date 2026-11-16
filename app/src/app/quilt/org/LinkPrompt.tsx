'use client'

import { useEffect, useRef, useState } from 'react'

const W = 300

/**
 * Asks what a link you just drew means.
 *
 * Appears where the drag ended, because that is where your attention is. The
 * labels you have used before are offered first: a small vocabulary used
 * consistently ("supports", "blocks", "example of") is what makes the labels
 * comparable across the graph, and twelve spellings of the same relation are
 * not.
 *
 * Enter with nothing typed still makes the link, unlabelled — the label is the
 * point, but refusing the link without one would just send you elsewhere to write it.
 */
export default function LinkPrompt({
  from, to, x, y, vocabulary, initial = '', onSave, onCancel,
}: {
  from: string
  to: string
  x: number
  y: number
  vocabulary: string[]
  initial?: string
  onSave: (label: string) => Promise<void>
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => { input.current?.focus() }, [])

  const save = async (value: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(value.trim())
    } catch (e) {
      setError(String((e as Error).message ?? e))
      setBusy(false)
    }
  }

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const left = Math.min(Math.max(8, x - W / 2), vw - W - 8)
  const top = Math.min(y + 12, vh - 200)

  const q = label.trim().toLowerCase()
  const offered = vocabulary.filter(v => !q || v.toLowerCase().includes(q)).slice(0, 8)

  return (
    <div className="fixed z-50 rounded-lg border border-gray-200 bg-white shadow-xl p-2.5 space-y-2"
      style={{ left, top, width: W }}>
      <div className="text-[11px] leading-snug text-gray-600">
        <span className="font-semibold text-gray-900">{from}</span>
        <span className="text-indigo-500 mx-1">→</span>
        <span className="font-semibold text-gray-900">{to}</span>
      </div>
      <input
        ref={input}
        value={label}
        disabled={busy}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') save(label)
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="how are they connected?"
        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400"
      />
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {offered.map(v => (
            <button key={v} disabled={busy} onClick={() => save(v)}
              className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{busy ? 'saving…' : '⏎ save · esc cancel · empty = plain link'}</span>
        <button onClick={onCancel} className="hover:text-gray-600">cancel</button>
      </div>
      {error && <div className="text-[10px] text-red-600 break-words">{error}</div>}
    </div>
  )
}
