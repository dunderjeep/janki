'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export type PickedCard = {
  id: string
  front: string
  back: string
  deckId: string
  deckName: string
}

interface CardPickerProps {
  label: string
  accentClass?: string
  selected: PickedCard | null
  onSelect: (card: PickedCard) => void
  onClear: () => void
}

export function CardPicker({ label, accentClass = 'border-blue-400 ring-blue-100', selected, onSelect, onClear }: CardPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickedCard[]>([])
  const [loading, setLoading] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const diceRef = useRef<HTMLButtonElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/srs/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 250)
  }

  const pick = (card: PickedCard) => {
    onSelect(card)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const handleRandom = async () => {
    if (rolling) return
    setRolling(true)
    // Re-trigger animation by briefly removing + re-adding the class
    if (diceRef.current) {
      diceRef.current.classList.remove('dice-rolling')
      void diceRef.current.offsetWidth // force reflow
      diceRef.current.classList.add('dice-rolling')
    }
    try {
      const res = await fetch('/api/srs/cards/random')
      const data = await res.json()
      if (data.card) pick(data.card)
    } catch {
      // silently ignore
    } finally {
      setRolling(false)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <style>{`
        @keyframes dice-roll {
          0%   { transform: rotate(0deg)   scale(1);   }
          15%  { transform: rotate(72deg)  scale(1.3); }
          30%  { transform: rotate(144deg) scale(0.85);}
          45%  { transform: rotate(216deg) scale(1.2); }
          60%  { transform: rotate(288deg) scale(0.9); }
          75%  { transform: rotate(360deg) scale(1.15);}
          90%  { transform: rotate(400deg) scale(0.95);}
          100% { transform: rotate(360deg) scale(1);   }
        }
        .dice-rolling {
          animation: dice-roll 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>

      <div className="flex flex-col gap-2" ref={containerRef}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</span>
          <button
            ref={diceRef}
            onClick={handleRandom}
            disabled={rolling}
            title="Pick a random card"
            className="text-xl leading-none hover:scale-110 active:scale-95 transition-transform disabled:opacity-40 select-none"
            aria-label="Random card"
          >
            🎲
          </button>
        </div>

        {selected ? (
          <div className={`relative rounded-xl border-2 ${accentClass} bg-white p-4 ring-2`}>
            <button
              onClick={onClear}
              className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 text-lg leading-none"
              aria-label="Clear selection"
            >
              ×
            </button>
            <p className="text-xs text-gray-400 mb-1">{selected.deckName}</p>
            <p className="font-medium text-gray-800 text-sm leading-snug">{selected.front}</p>
            <p className="mt-2 text-sm text-gray-500 line-clamp-3">{selected.back}</p>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={handleChange}
              placeholder="Search cards by front or back…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {loading && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">searching…</span>
            )}
            {open && results.length > 0 && (
              <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      onMouseDown={() => pick(r)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors"
                    >
                      <p className="text-xs text-gray-400">{r.deckName}</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{r.front}</p>
                      <p className="text-xs text-gray-500 truncate">{r.back}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {open && results.length === 0 && query.length >= 2 && !loading && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow px-4 py-3 text-sm text-gray-400">
                No cards found for "{query}"
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
