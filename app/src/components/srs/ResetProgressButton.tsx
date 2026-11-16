'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Variant = 'icon' | 'button'

/**
 * Resets SRS scheduling back to "new" for a deck, a topic subtree, or everything.
 * Always asks for confirmation first — the schedule is not recoverable.
 */
export function ResetProgressButton({
  endpoint,
  scopeLabel,
  scopeNote,
  cardCount,
  variant = 'icon',
  onDone,
  reloadOnDone = false,
}: {
  /** POST target, e.g. /api/srs/decks/abc/reset */
  endpoint: string
  /** What is being reset, e.g. 'deck "Chemistry"' */
  scopeLabel: string
  /** Extra line in the dialog, e.g. 'Includes every sub-topic.' */
  scopeNote?: string
  cardCount?: number
  variant?: Variant
  /** Called after a successful reset, so the caller can patch its own state. */
  onDone?: () => void
  /** Full page reload instead of a soft refresh — for callers whose children hold their own state. */
  reloadOnDone?: boolean
}) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function confirmReset() {
    setBusy(true)
    setError(null)
    try {
      const res  = await fetch(endpoint, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Reset failed'); return }
      setOpen(false)
      onDone?.()
      if (reloadOnDone) window.location.reload()
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
          className="shrink-0 text-gray-300 hover:text-amber-500 transition-colors text-xs px-0.5"
          title={`Reset progress for ${scopeLabel}`}
        >
          ↺
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          ↺ Reset All
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!busy) setOpen(false) }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-gray-900 mb-2">Reset progress?</h2>
            <p className="text-sm text-gray-600">
              Every card in {scopeLabel} goes back to “new”
              {typeof cardCount === 'number' && cardCount > 0 && (
                <> — <span className="font-semibold">{cardCount} card{cardCount === 1 ? '' : 's'}</span></>
              )}
              . Stability, difficulty, reps, lapses and due dates are all cleared.
            </p>
            {scopeNote && <p className="text-sm text-gray-500 mt-2">{scopeNote}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Your review history is kept — only the schedule is reset. This cannot be undone.
            </p>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                disabled={busy}
                className="text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
