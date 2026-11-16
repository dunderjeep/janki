'use client'

import { useState } from 'react'
import { CardPicker, type PickedCard } from '@/components/srs/CardPicker'
import Link from 'next/link'

type Result = {
  cardId: string
  deckId: string
  front: string
  back: string
}

export function ConnectPage() {
  const [cardA, setCardA] = useState<PickedCard | null>(null)
  const [cardB, setCardB] = useState<PickedCard | null>(null)
  const [connectionText, setConnectionText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const canGenerate = !!(cardA && cardB)
  const canSave = !!(cardA && cardB && connectionText.trim())

  async function handleGenerate() {
    if (!canGenerate) return
    setGenerating(true)
    setError('')
    setConnectionText('')
    try {
      const res = await fetch('/api/srs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardAId: cardA!.id, cardBId: cardB!.id, generate: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setConnectionText(data.back)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/srs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardAId: cardA!.id,
          cardBId: cardB!.id,
          connectionText,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setCardA(null)
    setCardB(null)
    setConnectionText('')
    setResult(null)
    setError('')
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">✦</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Bridge card created!</h2>
        <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-6 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Front</p>
          <p className="font-medium text-gray-800">{result.front}</p>
          <hr className="my-4 border-gray-100" />
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Back</p>
          <p className="text-gray-700 leading-relaxed">{result.back}</p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href={`/srs/${result.deckId}`}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            View Connections Deck
          </Link>
          <button
            onClick={reset}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
          >
            Make Another
          </button>
        </div>
      </div>
    )
  }

  // ── Main interface ────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">✦</span>
          <h1 className="text-2xl font-bold text-gray-900">Card Connections</h1>
        </div>
        <p className="text-sm text-gray-500 ml-9">
          Pick two cards from any deck — find surprising links, analogies, and shared structures.
          Bridge cards are saved to your <strong>Connections</strong> deck and reviewed via spaced repetition.
        </p>
      </div>

      {/* Card pickers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <CardPicker
          label="Card A"
          accentClass="border-violet-400 ring-violet-100"
          selected={cardA}
          onSelect={setCardA}
          onClear={() => setCardA(null)}
        />
        <CardPicker
          label="Card B"
          accentClass="border-rose-400 ring-rose-100"
          selected={cardB}
          onSelect={setCardB}
          onClear={() => setCardB(null)}
        />
      </div>

      {/* Connection section */}
      {cardA && cardB && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          {/* Connector visual */}
          <div className="flex items-center gap-3 mb-5 text-sm">
            <span className="px-3 py-1 bg-violet-50 text-violet-700 rounded-full font-medium truncate max-w-[180px]">
              {cardA.front.slice(0, 40)}{cardA.front.length > 40 ? '…' : ''}
            </span>
            <span className="text-gray-300 text-lg flex-shrink-0">↔</span>
            <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-full font-medium truncate max-w-[180px]">
              {cardB.front.slice(0, 40)}{cardB.front.length > 40 ? '…' : ''}
            </span>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Connection
          </label>
          <textarea
            value={connectionText}
            onChange={(e) => setConnectionText(e.target.value)}
            rows={5}
            placeholder="Describe the connection… or generate one with Claude below."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />

          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {generating ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <><span>✦</span> Generate with Claude</>
              )}
            </button>

            <button
              onClick={handleSave}
              disabled={!canSave || saving || generating}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save Bridge Card'}
            </button>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            The bridge card will be added to your <strong>Connections</strong> deck and scheduled for spaced repetition review.
          </p>
        </div>
      )}

      {/* Placeholder when no cards selected */}
      {(!cardA || !cardB) && (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">⟷</p>
          <p className="text-sm">Search and select two cards above to find their connection</p>
          <p className="text-xs mt-2 text-gray-300">Try concepts from completely different decks for the best surprises</p>
        </div>
      )}
    </div>
  )
}
