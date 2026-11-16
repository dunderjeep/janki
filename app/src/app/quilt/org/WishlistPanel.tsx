'use client'

import { useCallback, useEffect, useState } from 'react'

type Item = { raw: string; label: string; done: boolean; line: number }
type Wishlist = { items: Item[]; done: number; total: number; live: boolean }

function CheckRow({
  item, busy, deleting, onToggle, onDelete,
}: {
  item: Item
  busy: boolean
  deleting: boolean
  onToggle: (i: Item) => void
  onDelete: (i: Item) => void
}) {
  return (
    <div className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50">
      <button
        onClick={() => onToggle(item)}
        disabled={busy}
        className="flex-1 min-w-0 flex items-center gap-1.5 text-left disabled:opacity-40"
      >
        <span
          className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center
                      text-[8px] font-bold ${
            item.done ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'
          }`}
        >
          ✓
        </span>
        <span className={`flex-1 min-w-0 truncate text-[11px] ${
          item.done ? 'text-gray-400 line-through' : 'text-gray-700'
        }`} title={item.label}>
          {item.label}
        </span>
      </button>
      <button
        onClick={() => onDelete(item)}
        disabled={deleting}
        title="Delete this item"
        className="flex-shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center
                   text-[10px] leading-none text-gray-300 opacity-0 group-hover:opacity-100
                   hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
      >
        ×
      </button>
    </div>
  )
}

/**
 * wishlist.org's checkboxes, ticked in the note the same way the routine
 * is — see /api/org/wishlist/toggle. Sits at the bottom of the sidebar,
 * below everything about the graph itself: this is a want-list, not part of
 * the horizon rings.
 */
export default function WishlistPanel() {
  const [list, setList] = useState<Wishlist | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const reload = useCallback(() => {
    fetch('/api/org/wishlist').then(r => r.json()).then(setList).catch(() => {})
  }, [])

  useEffect(() => {
    reload()
    const timer = setInterval(reload, 20000)
    const onVisible = () => { if (!document.hidden) reload() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', reload)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reload)
    }
  }, [reload])

  const toggle = useCallback(async (item: Item) => {
    setBusy(item.line)
    setError(null)
    try {
      const res = await fetch('/api/org/wishlist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: item.line, raw: item.raw, want: item.done ? 'open' : 'done' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'toggle failed')
        reload()
        return
      }
      setList(data)
    } finally {
      setBusy(null)
    }
  }, [reload])

  /** Append a new checkbox item — see /api/org/wishlist and quilt/append-checkbox. */
  const add = useCallback(async () => {
    const text = newText.trim()
    if (!text) { setAdding(false); return }
    setAddBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/org/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'add failed')
        return
      }
      setList(data)
      setNewText('')
      setAdding(false)
    } catch {
      setError('Request failed')
    } finally {
      setAddBusy(false)
    }
  }, [newText])

  /** Delete the checkbox line. One confirm, then it's gone. */
  const remove = useCallback(async (item: Item) => {
    if (!confirm(`Delete “${item.label}”? This cannot be undone.`)) return
    setDeleting(item.line)
    setError(null)
    try {
      const res = await fetch('/api/org/wishlist/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: item.line, raw: item.raw }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'delete failed')
        reload()
        return
      }
      setList(data)
    } finally {
      setDeleting(null)
    }
  }, [reload])

  if (!list) return null

  return (
    <div className="px-3 py-2 border-b border-gray-100">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Wishlist
        </span>
        <div className="flex items-center gap-1.5">
          {list.total > 0 && (
            <span className="text-[11px] font-semibold text-gray-500">{list.done}/{list.total}</span>
          )}
          <button
            onClick={() => setAdding(v => !v)}
            title="Add a wishlist item"
            className="w-4 h-4 rounded flex items-center justify-center leading-none
                       text-gray-400 hover:text-indigo-600 hover:bg-gray-100"
          >
            +
          </button>
        </div>
      </div>

      {adding && (
        <input
          autoFocus
          value={newText}
          disabled={addBusy}
          onChange={e => setNewText(e.target.value)}
          onBlur={() => { if (!newText.trim()) setAdding(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') { setNewText(''); setAdding(false) }
          }}
          placeholder="New item…"
          className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 mb-1
                     focus:outline-none focus:border-indigo-400 disabled:opacity-50"
        />
      )}

      {list.total === 0 ? (
        <p className="text-[10px] text-gray-400 leading-snug">Nothing in wishlist.org.</p>
      ) : (
        <div className="space-y-0.5 max-h-56 overflow-y-auto">
          {list.items.map(item => (
            <CheckRow key={item.line} item={item} busy={busy === item.line}
              deleting={deleting === item.line} onToggle={toggle} onDelete={remove} />
          ))}
        </div>
      )}

      {error && <p className="text-[10px] text-red-500 mt-1 leading-snug">{error}</p>}
    </div>
  )
}
