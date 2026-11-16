'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type PickableTopic = { id: string; name: string; color: string | null }

/**
 * Assign this whole deck to topics — the deck-level counterpart of the card-level
 * "move to deck" picker. Unchecking every topic leaves the deck Unassigned.
 *
 * Typing a name that matches nothing offers to create that topic and assign the
 * deck to it in one go, so a new subject never needs a detour to the SRS home.
 */
export function DeckTopicPicker({
  deckId,
  allTopics,
  initialTopicIds,
}: {
  deckId: string
  allTopics: PickableTopic[]
  initialTopicIds: string[]
}) {
  const router = useRouter()
  const [open,     setOpen]     = useState(false)
  const [topics,   setTopics]   = useState<PickableTopic[]>(allTopics)
  const [topicIds, setTopicIds] = useState<string[]>(initialTopicIds)
  const [filter,   setFilter]   = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // The server may hand down a fresh list after router.refresh().
  useEffect(() => { setTopics(allTopics) }, [allTopics])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const current = new Set(topicIds)

  async function toggle(topicId: string) {
    const adding = !current.has(topicId)
    setTopicIds(prev => adding ? [...prev, topicId] : prev.filter(id => id !== topicId))

    const res = adding
      ? await fetch(`/api/srs/topics/${topicId}/decks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ deckId }),
        })
      : await fetch(`/api/srs/topics/${topicId}/decks/${deckId}`, { method: 'DELETE' })

    if (!res.ok) {
      // revert
      setTopicIds(prev => adding ? prev.filter(id => id !== topicId) : [...prev, topicId])
      return
    }
    router.refresh()
  }

  async function createAndAssign() {
    const name = filter.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/srs/topics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      if (!res.ok) return
      const { topic } = await res.json() as { topic: PickableTopic }

      const link = await fetch(`/api/srs/topics/${topic.id}/decks`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ deckId }),
      })

      setTopics(prev => [...prev, { id: topic.id, name: topic.name, color: topic.color ?? null }])
      if (link.ok) setTopicIds(prev => [...prev, topic.id])
      setFilter('')
      router.refresh()
    } finally {
      setCreating(false)
    }
  }

  const query = filter.trim().toLowerCase()
  const shown = topics.filter(t => t.name.toLowerCase().includes(query))
  const exact = topics.some(t => t.name.trim().toLowerCase() === query)
  const canCreate = query.length > 0 && !exact

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-300 rounded-full px-2 py-0.5 transition-colors"
        title="Move this deck into a topic"
      >
        {topicIds.length === 0 ? '📂 Move to topic…' : '＋ topic'}
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-64 max-h-80 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pb-1">
            Topics for this deck
          </p>
          <input
            autoFocus
            value={filter}
            onChange={e => setFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canCreate) createAndAssign()
              if (e.key === 'Escape') setFilter('')
            }}
            placeholder="Filter or name a new topic…"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {shown.length === 0 && !canCreate && (
            <p className="text-xs text-gray-400 px-2 py-1.5 italic">No topics match.</p>
          )}
          {shown.map(t => (
            <label
              key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={current.has(t.id)}
                onChange={() => toggle(t.id)}
                className="rounded accent-indigo-500"
              />
              {t.color && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              )}
              <span className="text-xs text-gray-700 truncate">{t.name}</span>
            </label>
          ))}
          {canCreate && (
            <button
              onClick={createAndAssign}
              disabled={creating}
              className="w-full flex items-center gap-2 px-2 py-1.5 mt-0.5 rounded-lg text-left hover:bg-indigo-50 disabled:opacity-50 transition-colors"
            >
              <span className="text-indigo-500 text-xs font-semibold shrink-0">＋</span>
              <span className="text-xs text-indigo-700 truncate">
                {creating ? 'Creating…' : <>Create “{filter.trim()}”</>}
              </span>
            </button>
          )}
          {topicIds.length === 0 && (
            <p className="text-[10px] text-gray-400 px-2 pt-1">
              With no topic, the deck sits in Unassigned.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
