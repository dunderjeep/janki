'use client'

import { useState, useEffect, useRef } from 'react'

type Suggestion = { front: string; back: string }

type AtomizeState =
  | { phase: 'loading' }
  | { phase: 'review'; original: Suggestion; suggestions: Suggestion[]; tags: string[]; selected: boolean[] }
  | { phase: 'saving' }
  | { phase: 'done'; count: number }
  | { phase: 'error'; message: string }

export function AtomizeModal({
  cardId,
  deckId,
  onClose,
  onReplaced,
}: {
  cardId: string
  deckId: string
  onClose: () => void
  /** Called after the original is deleted and replacements saved. */
  onReplaced: (count: number) => void
}) {
  const [state, setState] = useState<AtomizeState>({ phase: 'loading' })
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/srs/cards/${cardId}/atomize`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState({ phase: 'error', message: data.error }); return }
        setState({
          phase: 'review',
          original: data.original,
          suggestions: data.suggestions,
          tags: data.tags ?? [],
          selected: data.suggestions.map(() => true),
        })
      })
      .catch(e => setState({ phase: 'error', message: e.message }))
  }, [cardId])

  async function handleConfirm() {
    if (state.phase !== 'review') return
    const chosen = state.suggestions.filter((_, i) => state.selected[i])
    if (chosen.length === 0) { onClose(); return }

    setState({ phase: 'saving' })

    for (const s of chosen) {
      await fetch(`/api/srs/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ front: s.front, back: s.back, tags: state.tags }),
      })
    }
    await fetch(`/api/srs/cards/${cardId}`, { method: 'DELETE' })

    setState({ phase: 'done', count: chosen.length })
    onReplaced(chosen.length)
  }

  function toggleSelected(i: number) {
    if (state.phase !== 'review') return
    setState({ ...state, selected: state.selected.map((v, idx) => idx === i ? !v : v) })
  }

  const selectedCount = state.phase === 'review' ? state.selected.filter(Boolean).length : 0

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">⚡ Atomize card</h2>
            <p className="text-xs text-gray-400 mt-0.5">Woźniak 20 Rules · Nielsen, Augmenting LTM</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {(state.phase === 'loading' || state.phase === 'saving') && (
            <div className="text-center py-8 text-sm text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full mb-3" />
              <p>{state.phase === 'loading' ? 'Applying Woźniak rules…' : 'Saving…'}</p>
            </div>
          )}

          {state.phase === 'done' && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm text-gray-700">
                Replaced with {state.count} atomic card{state.count !== 1 ? 's' : ''}.
              </p>
            </div>
          )}

          {state.phase === 'error' && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{state.message}</div>
          )}

          {state.phase === 'review' && (
            <>
              {/* Original */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                <p className="font-semibold text-gray-400 uppercase tracking-wide mb-1.5 text-[10px]">Original</p>
                <p className="text-gray-700 font-medium">{state.original.front}</p>
                <p className="text-gray-500 mt-1">{state.original.back}</p>
              </div>

              {state.suggestions.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                  Claude could not produce atomic replacements for this card.
                  Try editing it manually or using Refine.
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    {state.suggestions.length === 1
                      ? 'Already atomic — wording improved per Rule 11.'
                      : `Replace with ${state.suggestions.length} atomic cards. Deselect any to skip.`}
                  </p>
                  <ul className="space-y-2">
                    {state.suggestions.map((s, i) => (
                      <li
                        key={i}
                        onClick={() => toggleSelected(i)}
                        className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                          state.selected[i]
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-gray-200 bg-white opacity-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            state.selected[i] ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-300'
                          }`}>
                            {state.selected[i] ? '✓' : ''}
                          </span>
                          <div className="text-xs min-w-0">
                            <p className="font-medium text-gray-800">{s.front}</p>
                            <p className="text-gray-500 mt-0.5">{s.back}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(state.phase === 'review' || state.phase === 'done' || state.phase === 'error') && (
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            {state.phase === 'review' ? (
              <>
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0}
                  className="px-4 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {state.suggestions.length === 1
                    ? 'Replace (wording updated)'
                    : `Replace with ${selectedCount} card${selectedCount !== 1 ? 's' : ''}`}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
