'use client'

/** Search the org directory by name, title or contents, and open what you find. */
import { useEffect, useRef, useState } from 'react'
import type { OrgHit } from '@/lib/scatterbrain/types'
import { api } from '../porcupin/intake'

export default function OrgPalette({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<OrgHit[] | null>(null)
  const [cursor, setCursor] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    const ticket = ++latest.current
    const timer = setTimeout(() => {
      api<{ hits: OrgHit[] }>(`/api/scatterbrain/org/search?q=${encodeURIComponent(query)}`)
        .then((r) => {
          if (ticket !== latest.current) return // a newer search has replaced this one
          setHits(r.hits)
          setCursor(0)
          setError(null)
        })
        .catch((e: Error) => { if (ticket === latest.current) setError(e.message) })
    }, query ? 220 : 0)
    return () => clearTimeout(timer)
  }, [query])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, (hits?.length ?? 1) - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && hits?.[cursor]) onPick(hits[cursor].path)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Open a note" onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[12vh]">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search your org files by name, title or text"
          aria-label="Search your org files"
          className="rounded-t-xl border-b border-gray-200 px-4 py-3 text-base focus:outline-none"
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {error && <p role="alert" className="p-3 text-sm text-red-700">{error}</p>}
          {hits === null && !error && <p className="p-3 text-sm text-gray-500">Searching…</p>}
          {hits?.length === 0 && <p className="p-3 text-sm text-gray-500">Nothing matches that.</p>}
          {hits?.map((hit, i) => (
            <button
              key={hit.path}
              onClick={() => onPick(hit.path)}
              onMouseEnter={() => setCursor(i)}
              className={`block w-full rounded-md px-3 py-2 text-left ${i === cursor ? 'bg-purple-100' : ''}`}
            >
              <span className="block text-sm font-medium text-gray-900">{hit.title}</span>
              <span className="block truncate text-xs text-emerald-700">{hit.path}</span>
              {hit.snippet && <span className="mt-0.5 block truncate text-xs text-gray-500">{hit.snippet}</span>}
            </button>
          ))}
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">Enter adds it to this work. Edits are saved back to the file as Org.</p>
      </div>
    </div>
  )
}
