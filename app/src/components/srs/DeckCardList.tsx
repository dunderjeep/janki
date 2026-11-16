'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AtomizeModal } from './AtomizeModal'

type Card = {
  id: string
  front: string
  back: string
  tags: string[]
  state: string
  dueAt: string | null
}

type DeckOption = {
  id: string
  name: string
}

function cardHeat(state: string, dueAt: string | null): string {
  if (state === 'new' || !dueAt) return '#94a3b8'
  const diffDays = (new Date(dueAt).getTime() - Date.now()) / 86_400_000
  if (diffDays < 0) {
    const ratio = Math.min(-diffDays / 7, 1)
    return `hsl(${Math.round(25 - ratio * 25)}, ${Math.round(88 + ratio * 7)}%, ${Math.round(46 - ratio * 6)}%)`
  }
  if (diffDays < 1)  return 'hsl(48,  86%, 44%)'
  if (diffDays < 7)  return 'hsl(130, 60%, 40%)'
  if (diffDays < 30) return 'hsl(175, 58%, 40%)'
  return                    'hsl(218, 72%, 52%)'
}

export function DeckCardList({
  cards: initialCards,
  deckId,
  allDecks = [],
}: {
  cards: Card[]
  deckId: string
  allDecks?: DeckOption[]
}) {
  const router = useRouter()
  const [cards, setCards]           = useState(initialCards)
  const [query, setQuery]           = useState('')
  const [atomizing, setAtomizing]   = useState<Card | null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [targetDeckId, setTargetDeckId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [moveError, setMoveError]   = useState('')

  const filtered = query.trim().length < 1
    ? cards
    : cards.filter(c => {
        const q = query.toLowerCase()
        return c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q))
      })

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))

  function toggleCard(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  function clearSelection() {
    setSelected(new Set())
    setTargetDeckId('')
    setMoveError('')
  }

  async function handleMove() {
    if (!targetDeckId || selected.size === 0) return
    setMoveError('')
    const cardIds = [...selected]
    const res = await fetch('/api/srs/cards/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds, targetDeckId }),
    })
    if (!res.ok) {
      const { error } = await res.json()
      setMoveError(error ?? 'Move failed')
      return
    }
    // Remove moved cards from local state and clear selection
    setCards(prev => prev.filter(c => !selected.has(c.id)))
    clearSelection()
    startTransition(() => router.refresh())
  }

  const otherDecks = allDecks.filter(d => d.id !== deckId)

  return (
    <div>
      {/* Filter */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={`Filter ${cards.length} cards…`}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        )}
      </div>

      {query.trim() && <p className="text-xs text-gray-400 mb-3">{filtered.length} of {cards.length} cards</p>}

      {/* Select-all row (only shown when there are other decks to move to) */}
      {otherDecks.length > 0 && filtered.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            className="rounded accent-indigo-500 cursor-pointer"
            aria-label="Select all visible cards"
          />
          <span className="text-xs text-gray-400">
            {allFilteredSelected ? 'Deselect all' : 'Select all'} ({filtered.length})
          </span>
          {selected.size > 0 && (
            <button onClick={clearSelection} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Move action bar */}
      {selected.size > 0 && otherDecks.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5">
          <span className="text-sm font-medium text-indigo-700 shrink-0">
            {selected.size} card{selected.size !== 1 ? 's' : ''} selected
          </span>
          <select
            value={targetDeckId}
            onChange={e => setTargetDeckId(e.target.value)}
            className="flex-1 min-w-0 text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Move to deck…</option>
            {otherDecks.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            onClick={handleMove}
            disabled={!targetDeckId || isPending}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
          >
            {isPending ? 'Moving…' : 'Move'}
          </button>
          {moveError && <p className="w-full text-xs text-red-600">{moveError}</p>}
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map(card => {
          const heat = cardHeat(card.state, card.dueAt)
          const isSelected = selected.has(card.id)
          return (
            <li key={card.id} className="flex items-stretch gap-1.5">
              {/* Checkbox (only when other decks exist) */}
              {otherDecks.length > 0 && (
                <button
                  onClick={() => toggleCard(card.id)}
                  className={`shrink-0 w-8 flex items-center justify-center rounded-lg border transition-colors
                    ${isSelected
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-300'}`}
                  aria-label={isSelected ? 'Deselect card' : 'Select card'}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCard(card.id)}
                    className="rounded accent-indigo-500 cursor-pointer pointer-events-none"
                    tabIndex={-1}
                  />
                </button>
              )}
              <Link
                href={`/srs/${deckId}/cards/${card.id}`}
                className="flex flex-1 items-center bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors overflow-hidden"
              >
                <span className="w-1 self-stretch shrink-0" style={{ backgroundColor: heat }} />
                <span className="flex-1 text-sm text-gray-800 truncate px-3 py-3">{card.front}</span>
                <span className="mr-3 shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: heat }}>
                  {card.state}
                </span>
              </Link>
              <button
                onClick={() => setAtomizing(card)}
                title="Atomize — apply Woźniak 20 Rules"
                className="px-2.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors text-sm shrink-0"
              >
                ⚡
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="text-sm text-gray-400 py-4 text-center">No cards match</li>}
      </ul>

      {atomizing && (
        <AtomizeModal
          cardId={atomizing.id}
          deckId={deckId}
          onClose={() => setAtomizing(null)}
          onReplaced={() => {
            setCards(prev => prev.filter(c => c.id !== atomizing.id))
            setAtomizing(null)
          }}
        />
      )}
    </div>
  )
}
