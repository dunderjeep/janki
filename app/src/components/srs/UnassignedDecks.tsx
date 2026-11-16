'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type BulkDeck = {
  id: string
  name: string
  active: boolean
  total: number
  due: number
}

type Topic = { id: string; name: string; color: string | null }

const NEW_DECK = '__new__'

/**
 * Deck-level bulk editing: tick some decks, then file them under a topic, merge
 * their cards into one deck, or delete them. Built for the Unassigned pile,
 * where imports and one-off generators leave decks that need sorting out.
 */
export function UnassignedDecks({
  decks: initialDecks,
  topics,
  allDecks,
}: {
  decks: BulkDeck[]
  topics: Topic[]
  /** Every deck you own — merge targets, including ones on this page. */
  allDecks: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [decks,    setDecks]    = useState(initialDecks)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [topicId,  setTopicId]  = useState('')
  const [target,   setTarget]   = useState('')
  const [newName,  setNewName]  = useState('')
  const [deleteEmptied, setDeleteEmptied] = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [note,     setNote]     = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const chosen      = decks.filter(d => selected.has(d.id))
  const chosenCards = chosen.reduce((s, d) => s + d.total, 0)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll()   { setSelected(new Set(decks.map(d => d.id))) }
  function selectEmpty() { setSelected(new Set(decks.filter(d => d.total === 0).map(d => d.id))) }
  function clear()       { setSelected(new Set()); setError(null); setNote(null) }

  async function moveToTopic() {
    if (!topicId || chosen.length === 0) return
    setBusy(true); setError(null)
    try {
      for (const d of chosen) {
        const res = await fetch(`/api/srs/topics/${topicId}/decks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ deckId: d.id }),
        })
        if (!res.ok) { setError('Could not file every deck — some may have moved.'); break }
      }
      // Filed decks are no longer unassigned
      setDecks(prev => prev.filter(d => !selected.has(d.id)))
      setNote(`Filed ${chosen.length} deck${chosen.length === 1 ? '' : 's'}.`)
      clear()
      router.refresh()
    } finally { setBusy(false) }
  }

  async function merge() {
    if (chosen.length === 0) return
    if (target === NEW_DECK && !newName.trim()) { setError('Name the new deck first.'); return }
    if (!target) return

    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/srs/decks/merge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sourceDeckIds:  chosen.map(d => d.id),
          targetDeckId:   target === NEW_DECK ? undefined : target,
          targetDeckName: target === NEW_DECK ? newName.trim() : undefined,
          deleteEmptied,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Merge failed'); return }

      setDecks(prev => data.deleted > 0
        ? prev.filter(d => !selected.has(d.id) || d.id === data.targetDeckId)
        : prev.map(d => selected.has(d.id) && d.id !== data.targetDeckId ? { ...d, total: 0, due: 0 } : d))
      setNote(`Moved ${data.moved} card${data.moved === 1 ? '' : 's'}${data.deleted ? `, removed ${data.deleted} empty deck${data.deleted === 1 ? '' : 's'}` : ''}.`)
      clear()
      setNewName('')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function deleteSelected() {
    if (chosen.length === 0) return
    const withCards = chosen.filter(d => d.total > 0)
    const warning = withCards.length > 0
      ? `\n\n${withCards.length} of them still hold cards (${chosenCards} in total) — those cards go too.`
      : ''
    if (!confirm(`Delete ${chosen.length} deck${chosen.length === 1 ? '' : 's'}?${warning}\n\nThis cannot be undone.`)) return

    setBusy(true); setError(null)
    try {
      for (const d of chosen) {
        const res = await fetch(`/api/srs/decks/${d.id}`, { method: 'DELETE' })
        if (!res.ok) { setError('Could not delete every deck.'); break }
      }
      setDecks(prev => prev.filter(d => !selected.has(d.id)))
      setNote(`Deleted ${chosen.length} deck${chosen.length === 1 ? '' : 's'}.`)
      clear()
      router.refresh()
    } finally { setBusy(false) }
  }

  if (decks.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4">Nothing unassigned — every deck is filed under a topic.</p>
  }

  const emptyCount = decks.filter(d => d.total === 0).length

  return (
    <div>
      {/* Selection controls */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-500 flex-wrap">
        <button onClick={selectAll} className="hover:text-gray-900 transition-colors">Select all ({decks.length})</button>
        {emptyCount > 0 && (
          <button onClick={selectEmpty} className="hover:text-gray-900 transition-colors">
            Select empty ({emptyCount})
          </button>
        )}
        {selected.size > 0 && (
          <button onClick={clear} className="hover:text-gray-900 transition-colors">Clear</button>
        )}
        {note && <span className="text-green-700">{note}</span>}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-3 space-y-2">
          <p className="text-sm font-medium text-indigo-700">
            {selected.size} deck{selected.size === 1 ? '' : 's'} selected · {chosenCards} card{chosenCards === 1 ? '' : 's'}
          </p>

          {/* File under a topic */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={topicId}
              onChange={e => setTopicId(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">File under topic…</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={moveToTopic}
              disabled={!topicId || busy}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
            >
              File
            </button>
          </div>

          {/* Merge cards into one deck */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="flex-1 min-w-0 text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Move all cards into…</option>
              <option value={NEW_DECK}>＋ a new deck…</option>
              {allDecks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {target === NEW_DECK && (
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="New deck name"
                className="flex-1 min-w-0 text-sm border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
            <button
              onClick={merge}
              disabled={!target || busy}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
            >
              {busy ? 'Working…' : 'Move cards'}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-indigo-700 w-full">
              <input
                type="checkbox"
                checked={deleteEmptied}
                onChange={e => setDeleteEmptied(e.target.checked)}
                className="rounded accent-indigo-500"
              />
              delete the emptied decks afterwards
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={deleteSelected}
              disabled={busy}
              className="text-sm text-red-700 hover:text-red-900 disabled:opacity-40 transition-colors"
            >
              🗑 Delete selected
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {/* Deck rows */}
      <ul className="space-y-1">
        {decks.map(d => (
          <li
            key={d.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
              ${selected.has(d.id) ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100 hover:border-blue-200'}
              ${d.active ? '' : 'opacity-60'}`}
          >
            <input
              type="checkbox"
              checked={selected.has(d.id)}
              onChange={() => toggle(d.id)}
              className="rounded accent-indigo-500 cursor-pointer shrink-0"
              aria-label={`Select ${d.name}`}
            />
            <Link href={`/srs/${d.id}`} className="flex-1 min-w-0 text-sm text-gray-800 hover:text-blue-600 truncate">
              {d.name}
            </Link>
            <span className="shrink-0 text-xs text-gray-400">{d.total} cards</span>
            {d.due > 0 && (
              <span className="shrink-0 text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">{d.due} due</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
