'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Result = {
  id: string
  front: string
  back: string
  deckId: string
  deckName: string
}

export function SearchBar({
  deckId,
  placeholder = 'Search cards…',
}: {
  deckId?: string
  placeholder?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions with debounce
  const fetchResults = useCallback(
    async (q: string) => {
      if (q.length < 2) { setResults([]); setOpen(false); return }
      setLoading(true)
      try {
        const url = `/api/srs/search?q=${encodeURIComponent(q)}${deckId ? `&deckId=${deckId}` : ''}`
        const res = await fetch(url)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
        setActive(-1)
      } finally {
        setLoading(false)
      }
    },
    [deckId],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchResults(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, fetchResults])

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function navigate(result: Result) {
    router.push(`/srs/${result.deckId}/cards/${result.id}`)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && results[active]) navigate(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const isGlobal = !deckId

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={(e) => { e.preventDefault(); navigate(r) }}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex flex-col items-start px-4 py-2.5 text-left transition-colors ${
                i === active ? 'bg-indigo-50' : 'hover:bg-gray-50'
              } ${i > 0 ? 'border-t border-gray-100' : ''}`}
            >
              {isGlobal && (
                <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-0.5">
                  {r.deckName}
                </span>
              )}
              <span className="text-sm text-gray-800 truncate w-full">{r.front}</span>
              <span className="text-xs text-gray-400 truncate w-full mt-0.5">{r.back}</span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
          No cards found
        </div>
      )}
    </div>
  )
}
