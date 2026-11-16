'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import Link from 'next/link'
import { DeckActiveToggle } from './DeckActiveToggle'
import { ResetProgressButton } from './ResetProgressButton'
import { DeleteDeckButton } from './DeleteDeckButton'


// ── Types ──────────────────────────────────────────────────────────────────────

export type TopicSummary = {
  id: string
  name: string
  description: string
  active: boolean
  sortOrder: number
  color: string | null
}

export type TopicParentLink = {
  topicId: string
  parentId: string
}

export type TopicDeckLink = {
  topicId: string
  deckId: string
  sortOrder?: number
}

export type DeckSummary = {
  id: string
  name: string
  description: string
  active: boolean
  total: number
  due: number
}

// ── Collapse memory ────────────────────────────────────────────────────────────
// Which topics are collapsed is a navigation preference, not data — it lives in
// localStorage so it survives going into a deck and coming back out.

const COLLAPSE_KEY = 'janki:srs:collapsedTopics'

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return raw ? JSON.parse(raw) as Record<string, boolean> : {}
  } catch { return {} }
}

function writeCollapsed(topicId: string, collapsed: boolean) {
  try {
    const all = readCollapsed()
    all[topicId] = collapsed
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(all))
  } catch { /* private mode / storage disabled — fall back to per-visit state */ }
}

/** Collapse state for one topic, remembered across navigations. */
function usePersistedCollapse(topicId: string, fallback: boolean) {
  const [collapsed, setCollapsed] = useState(fallback)

  // Read after mount so server and first client render agree
  useEffect(() => {
    const stored = readCollapsed()[topicId]
    if (stored !== undefined) setCollapsed(stored)
  }, [topicId])

  const set = useCallback((next: boolean) => {
    setCollapsed(next)
    writeCollapsed(topicId, next)
  }, [topicId])

  return [collapsed, set] as const
}

// ── Heat colour ────────────────────────────────────────────────────────────────
// Continuous blue (cold/safe) → red (hot/urgent) gradient.
// Returned as a CSS color string suitable for a border or dot.

function heatColor(due: number, total: number): string {
  if (total === 0) return '#94a3b8'      // slate — no cards yet
  if (due === 0)   return '#60a5fa'      // blue  — all safe
  const ratio = Math.min(due / total, 1)
  // hue: 220 (blue) → 0 (red), keeping saturation & lightness readable
  const hue = Math.round(220 * (1 - ratio))
  const sat = 78 + Math.round(ratio * 12)   // 78 → 90
  const lit = 47 - Math.round(ratio * 7)    // 47 → 40  (dark enough for contrast)
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}

// ── Topic picker popover ───────────────────────────────────────────────────────

function TopicPicker({
  deckId,
  allTopics,
  currentTopicIds,
  onAdd,
  onRemove,
  onClose,
}: {
  deckId: string
  allTopics: TopicSummary[]
  currentTopicIds: string[]
  onAdd: (topicId: string) => void
  onRemove: (topicId: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  const currentSet = new Set(currentTopicIds)

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-60 max-h-72 overflow-y-auto"
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pb-1">
        Also in these topics
      </p>
      {allTopics.map(t => {
        const checked = currentSet.has(t.id)
        return (
          <label
            key={t.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => checked ? onRemove(t.id) : onAdd(t.id)}
              className="rounded accent-indigo-500"
            />
            {t.color && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            )}
            <span className="text-xs text-gray-700 truncate">{t.name}</span>
          </label>
        )
      })}
    </div>
  )
}

// ── Topic parent picker popover ───────────────────────────────────────────────

function getDescendants(topicId: string, childMap: Map<string, string[]>): Set<string> {
  const result = new Set<string>()
  const queue = [topicId]
  while (queue.length) {
    const curr = queue.shift()!
    for (const child of childMap.get(curr) ?? []) {
      if (!result.has(child)) { result.add(child); queue.push(child) }
    }
  }
  return result
}

/**
 * Deck ids under `topicId` reached only through *active* sub-topics — a paused
 * sub-topic isn't being studied, so its cards aren't due for the parent either.
 */
function activeSubtreeDeckIds(
  topicId: string,
  childMap: Map<string, string[]>,
  topicDeckOrder: Map<string, string[]>,
  allTopics: Map<string, TopicSummary>,
): Set<string> {
  const decks = new Set<string>()
  const seen  = new Set<string>([topicId])
  const queue = [topicId]
  while (queue.length) {
    const curr = queue.shift()!
    for (const deckId of topicDeckOrder.get(curr) ?? []) decks.add(deckId)
    for (const child of childMap.get(curr) ?? []) {
      if (seen.has(child) || !allTopics.get(child)?.active) continue
      seen.add(child)
      queue.push(child)
    }
  }
  return decks
}

function TopicParentPicker({
  topicId,
  currentParentId,
  allTopics,
  childMap,
  onMove,
  onClose,
}: {
  topicId: string
  currentParentId: string | null
  allTopics: Map<string, TopicSummary>
  childMap: Map<string, string[]>
  onMove: (newParentId: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  const descendants = getDescendants(topicId, childMap)
  const options = [...allTopics.values()].filter(t => t.id !== topicId && !descendants.has(t.id))

  return (
    <div
      ref={ref}
      className="absolute right-0 top-7 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-60 max-h-72 overflow-y-auto"
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pb-1">
        Move under…
      </p>
      <button
        onClick={() => onMove(null)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-left transition-colors
          ${currentParentId === null ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}
      >
        <span className="truncate">📂 Top level</span>
        {currentParentId === null && <span className="ml-auto text-[10px] text-indigo-400 shrink-0">current</span>}
      </button>
      {options.map(t => (
        <button
          key={t.id}
          onClick={() => onMove(t.id)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-left transition-colors
            ${currentParentId === t.id ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}
        >
          {t.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />}
          <span className="truncate">{t.name}</span>
          {currentParentId === t.id && <span className="ml-auto text-[10px] text-indigo-400 shrink-0">current</span>}
        </button>
      ))}
    </div>
  )
}

// ── Sortable deck row ──────────────────────────────────────────────────────────
// ID scheme: "deck:{topicId}:{deckId}" — unique per topic instance

function DeckRow({
  sortableId,
  deck,
  topicActive,
  topicId,
  allTopics,
  currentTopicIds,
  onUnassign,
  onAddToTopic,
  onRemoveFromTopic,
  onRename,
  onReset,
  onDeleteDeck,
}: {
  sortableId: string
  deck: DeckSummary
  topicActive: boolean
  topicId: string | null
  allTopics: TopicSummary[]
  currentTopicIds: string[]
  onUnassign: (topicId: string, deckId: string) => void
  onAddToTopic: (topicId: string, deckId: string) => void
  onRemoveFromTopic: (topicId: string, deckId: string) => void
  onRename: (deckId: string, name: string) => void
  onReset: (deckIds: string[]) => void
  onDeleteDeck: (deckId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId })

  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [renaming,    setRenaming]    = useState(false)
  const [nameInput,   setNameInput]   = useState(deck.name)
  const nameRef = useRef<HTMLInputElement>(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const heat = heatColor(deck.due, deck.total)
  const topicCount = currentTopicIds.length

  function submitRename() {
    const trimmed = nameInput.trim()
    if (!trimmed) { setNameInput(deck.name); setRenaming(false); return }
    if (trimmed !== deck.name) onRename(deck.id, trimmed)
    setRenaming(false)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-2 pr-3 rounded-lg border border-gray-100 bg-white transition-shadow overflow-hidden
        ${isDragging ? 'opacity-40 shadow-lg z-10' : 'hover:border-blue-200'}
        ${!deck.active || !topicActive ? 'opacity-50' : ''}
      `}
    >
      {/* Heat stripe */}
      <div className="w-1 self-stretch shrink-0 rounded-l-lg" style={{ backgroundColor: heat }} />

      {/* Drag handle */}
      <button
        {...listeners}
        {...attributes}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0 py-2.5 px-0.5 touch-none"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Deck name — click link to open, double-click to rename */}
      {renaming ? (
        <input
          ref={nameRef}
          autoFocus
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={submitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') { setNameInput(deck.name); setRenaming(false) }
          }}
          className="flex-1 min-w-0 text-sm font-medium bg-white border border-blue-300 rounded-lg px-2 py-1.5 my-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      ) : (
        <div className="flex-1 min-w-0 py-2 group">
          <div className="flex items-center gap-1 min-w-0">
            <Link href={`/srs/${deck.id}`} className="text-sm font-medium text-gray-800 truncate hover:text-blue-600">
              {deck.name}
            </Link>
            <button
              onDoubleClick={() => setRenaming(true)}
              onClick={() => setRenaming(true)}
              className="shrink-0 text-gray-300 hover:text-gray-500 text-[10px] px-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Click to rename"
            >
              ✎
            </button>
          </div>
          <p className="text-xs text-gray-400">{deck.total} cards</p>
        </div>
      )}

      {/* Multi-topic badge */}
      {topicCount > 1 && (
        <span
          className="shrink-0 bg-purple-50 text-purple-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-purple-100"
          title={`In ${topicCount} topics`}
        >
          ×{topicCount}
        </span>
      )}

      {/* Due badge */}
      {deck.active && topicActive && deck.due > 0 && (
        <span
          className="shrink-0 text-white text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: heat }}
        >
          {deck.due} due
        </span>
      )}

      <DeckActiveToggle deckId={deck.id} initialActive={deck.active} />

      {/* ↺ Reset this deck's schedule */}
      <ResetProgressButton
        endpoint={`/api/srs/decks/${deck.id}/reset`}
        scopeLabel={`the deck “${deck.name}”`}
        cardCount={deck.total}
        onDone={() => onReset([deck.id])}
      />

      {/* ⊕ Also-in button */}
      <div className="relative shrink-0">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="text-gray-300 hover:text-indigo-500 transition-colors text-sm font-bold px-0.5"
          title="Also assign to another topic"
        >
          ⊕
        </button>
        {pickerOpen && (
          <TopicPicker
            deckId={deck.id}
            allTopics={allTopics}
            currentTopicIds={currentTopicIds}
            onAdd={tid => { onAddToTopic(tid, deck.id); setPickerOpen(false) }}
            onRemove={tid => { onRemoveFromTopic(tid, deck.id); setPickerOpen(false) }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {/* ✕ Remove from this topic */}
      {topicId && (
        <button
          onClick={() => onUnassign(topicId, deck.id)}
          className="shrink-0 text-gray-200 hover:text-red-400 transition-colors text-xs px-0.5"
          title="Remove from this topic (move to unassigned)"
        >
          ✕
        </button>
      )}

      {/* 🗑 Delete the deck itself */}
      <DeleteDeckButton
        deckId={deck.id}
        deckName={deck.name}
        cardCount={deck.total}
        onDeleted={() => onDeleteDeck(deck.id)}
      />
    </li>
  )
}

// ── Deck ghost (drag overlay) ──────────────────────────────────────────────────

function DeckGhost({ deck }: { deck: DeckSummary }) {
  const heat = heatColor(deck.due, deck.total)
  return (
    <div className="flex items-center gap-2 pl-1 pr-3 rounded-lg border border-blue-300 bg-blue-50 shadow-lg opacity-95 overflow-hidden">
      <div className="w-1 self-stretch shrink-0 rounded-l-lg" style={{ backgroundColor: heat }} />
      <span className="text-gray-300 py-2.5 px-0.5">⠿</span>
      <span className="text-sm font-medium text-gray-800 truncate py-2">{deck.name}</span>
    </div>
  )
}

// ── New topic form ─────────────────────────────────────────────────────────────

function NewTopicForm({
  parentId,
  onCreated,
  label = '+ sub-topic',
}: {
  parentId: string | null
  onCreated: (topic: TopicSummary, parentId: string | null) => void
  label?: string
}) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res  = await fetch('/api/srs/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parentId }),
      })
      const data = await res.json()
      if (res.ok) { onCreated(data.topic, parentId); setName(''); setOpen(false) }
    } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-700 border border-dashed border-gray-200 hover:border-gray-400 rounded-lg px-2.5 py-1 transition-colors"
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setName('') }
        }}
        placeholder="Topic name…"
        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
      >
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => { setOpen(false); setName('') }} className="text-xs text-gray-400 hover:text-gray-700">
        Cancel
      </button>
    </div>
  )
}

// ── New deck form ──────────────────────────────────────────────────────────────

function NewDeckForm({
  topicId,
  onCreated,
}: {
  topicId: string
  onCreated: (deck: DeckSummary) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/srs/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) return
      // Assign deck to this topic
      await fetch(`/api/srs/topics/${topicId}/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: data.deck.id }),
      })
      onCreated(data.deck)
      setName('')
      setOpen(false)
    } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-700 border border-dashed border-gray-200 hover:border-gray-400 rounded-lg px-2.5 py-1 transition-colors"
      >
        + deck
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setOpen(false); setName('') }
        }}
        placeholder="Deck name…"
        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
      >
        {saving ? '…' : 'Add'}
      </button>
      <button onClick={() => { setOpen(false); setName('') }} className="text-xs text-gray-400 hover:text-gray-700">
        Cancel
      </button>
    </div>
  )
}

// ── Single topic node (recursive) ─────────────────────────────────────────────

function TopicNode({
  topic,
  parentId,
  childMap,
  topicDeckOrder,
  deckTopicMap,
  allTopics,
  allDecks,
  depth,
  onRename,
  onDelete,
  onCreated,
  onDeckCreated,
  onUnassignDeck,
  onAddDeckToTopic,
  onRemoveDeckFromTopic,
  onReparent,
  onRenameDeck,
  onResetDecks,
  onDeleteDeck,
}: {
  topic: TopicSummary
  parentId: string | null
  childMap: Map<string, string[]>
  topicDeckOrder: Map<string, string[]>   // topicId → ordered [deckId, ...]
  deckTopicMap: Map<string, string[]>     // deckId → [topicId, ...]
  allTopics: Map<string, TopicSummary>
  allDecks: Map<string, DeckSummary>
  depth: number
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onCreated: (topic: TopicSummary, parentId: string | null) => void
  onDeckCreated: (deck: DeckSummary, topicId: string) => void
  onUnassignDeck: (topicId: string, deckId: string) => void
  onAddDeckToTopic: (topicId: string, deckId: string) => void
  onRemoveDeckFromTopic: (topicId: string, deckId: string) => void
  onReparent: (topicId: string, newParentId: string | null, oldParentId: string | null) => void
  onRenameDeck: (deckId: string, name: string) => void
  onResetDecks: (deckIds: string[]) => void
  onDeleteDeck: (deckId: string) => void
}) {
  const [collapsed,     setCollapsed]     = usePersistedCollapse(topic.id, depth > 1)
  const [renaming,      setRenaming]      = useState(false)
  const [nameInput,     setNameInput]     = useState(topic.name)
  const [active,        setActive]        = useState(topic.active)
  const [reparentOpen,  setReparentOpen]  = useState(false)
  const [, startTransition]       = useTransition()
  const inputRef                  = useRef<HTMLInputElement>(null)

  // Droppable ID prefixed so we can distinguish from deck sortable IDs
  const { setNodeRef, isOver } = useDroppable({ id: `topic:${topic.id}` })

  const deckIds  = topicDeckOrder.get(topic.id) ?? []
  const decks    = deckIds.map(id => allDecks.get(id)).filter(Boolean) as DeckSummary[]
  const childIds = childMap.get(topic.id) ?? []

  // Sortable IDs for this topic's deck list
  const sortableIds = deckIds.map(id => `deck:${topic.id}:${id}`)

  // Every deck under this topic, including sub-topics — the reset's true reach
  const subtreeDeckIds = [...new Set(
    [topic.id, ...getDescendants(topic.id, childMap)]
      .flatMap(tid => topicDeckOrder.get(tid) ?? []),
  )]
  const subtreeCards = subtreeDeckIds.reduce((s, id) => s + (allDecks.get(id)?.total ?? 0), 0)

  // Counts roll up the whole subtree — a parent holding only sub-topics still
  // reports what is under it. Deck ids are de-duplicated, so a deck filed in two
  // sibling topics is counted once.
  const totalCards = subtreeCards
  const totalDue   = active
    ? [...activeSubtreeDeckIds(topic.id, childMap, topicDeckOrder, allTopics)]
        .reduce((s, id) => {
          const d = allDecks.get(id)
          return d?.active ? s + d.due : s
        }, 0)
    : 0
  const topicHeat  = heatColor(totalDue, totalCards)

  function toggleActive() {
    const next = !active
    setActive(next)
    startTransition(() => {
      fetch(`/api/srs/topics/${topic.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: next }),
      })
    })
  }

  function submitRename() {
    if (!nameInput.trim()) { setRenaming(false); return }
    onRename(topic.id, nameInput.trim())
    setRenaming(false)
  }

  function handleDelete() {
    if (!confirm(`Delete topic "${topic.name}"? Decks will lose this topic assignment.`)) return
    onDelete(topic.id)
  }

  const allTopicsList = [...allTopics.values()]

  return (
    <div className={`${depth > 0 ? 'ml-5 border-l-2 border-gray-100 pl-3' : ''} mb-2`}>
      <div
        ref={setNodeRef}
        className={`rounded-xl border-2 transition-all overflow-hidden
          ${isOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-gray-50/20'}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-gray-700 transition-colors text-xs w-4 shrink-0"
          >
            {collapsed ? '▶' : '▼'}
          </button>

          {/* Topic colour dot + aggregate heat ring */}
          <div className="relative shrink-0 w-3 h-3">
            <span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: topic.color ?? '#e2e8f0' }}
            />
            {totalCards > 0 && (
              <span
                className="absolute -inset-0.5 rounded-full border-2"
                style={{ borderColor: topicHeat, opacity: 0.6 }}
              />
            )}
          </div>

          {renaming ? (
            <input
              ref={inputRef}
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={submitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') { setRenaming(false); setNameInput(topic.name) }
              }}
              className="flex-1 text-sm font-semibold bg-white border border-blue-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          ) : (
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <Link
                href={`/srs/topics/${topic.id}`}
                className="text-sm font-semibold text-gray-800 hover:text-blue-600 hover:underline truncate"
              >
                {topic.name}
              </Link>
              <button
                onDoubleClick={() => setRenaming(true)}
                className="shrink-0 text-gray-300 hover:text-gray-500 text-[10px] px-0.5"
                title="Double-click to rename"
              >
                ✎
              </button>
            </div>
          )}

          <span className="text-xs text-gray-400 shrink-0">{totalCards} cards</span>
          {totalDue > 0 && (
            <span
              className="shrink-0 text-white text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: topicHeat }}
            >
              {totalDue} due
            </span>
          )}

          <button
            onClick={toggleActive}
            className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all ${
              active
                ? 'bg-green-100 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-600'
            }`}
            title={active ? 'Pause this topic' : 'Resume this topic'}
          >
            {active ? 'Active' : 'Paused'}
          </button>

          {/* ↗ Reparent button */}
          <div className="relative shrink-0">
            <button
              onClick={() => setReparentOpen(v => !v)}
              className="text-gray-300 hover:text-indigo-500 transition-colors text-xs px-0.5"
              title="Move under a different parent"
            >
              ↗
            </button>
            {reparentOpen && (
              <TopicParentPicker
                topicId={topic.id}
                currentParentId={parentId}
                allTopics={allTopics}
                childMap={childMap}
                onMove={(newParentId) => {
                  onReparent(topic.id, newParentId, parentId)
                  setReparentOpen(false)
                }}
                onClose={() => setReparentOpen(false)}
              />
            )}
          </div>

          {/* ↺ Reset every deck under this topic */}
          <ResetProgressButton
            endpoint={`/api/srs/topics/${topic.id}/reset`}
            scopeLabel={`the topic “${topic.name}”`}
            scopeNote={childIds.length > 0 ? 'Includes every sub-topic beneath it.' : undefined}
            cardCount={subtreeCards}
            onDone={() => onResetDecks(subtreeDeckIds)}
          />

          <button
            onClick={handleDelete}
            className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-xs px-0.5"
            title="Delete topic"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {!collapsed && (
          <div className="px-3 pb-3 space-y-1.5">
            {decks.length > 0 && (
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {decks.map((deck, i) => (
                    <DeckRow
                      key={`${topic.id}:${deck.id}`}
                      sortableId={sortableIds[i]}
                      deck={deck}
                      topicActive={active}
                      topicId={topic.id}
                      allTopics={allTopicsList}
                      currentTopicIds={deckTopicMap.get(deck.id) ?? []}
                      onUnassign={onUnassignDeck}
                      onAddToTopic={onAddDeckToTopic}
                      onRemoveFromTopic={onRemoveDeckFromTopic}
                      onRename={onRenameDeck}
                      onReset={onResetDecks}
                      onDeleteDeck={onDeleteDeck}
                    />
                  ))}
                </ul>
              </SortableContext>
            )}

            {decks.length === 0 && childIds.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2 italic">
                {isOver ? 'Drop deck here' : 'No decks — drag one here or add a sub-topic'}
              </p>
            )}

            {/* Child topics */}
            {childIds.map(childId => {
              const child = allTopics.get(childId)
              if (!child) return null
              return (
                <TopicNode
                  key={childId}
                  topic={child}
                  parentId={topic.id}
                  childMap={childMap}
                  topicDeckOrder={topicDeckOrder}
                  deckTopicMap={deckTopicMap}
                  allTopics={allTopics}
                  allDecks={allDecks}
                  depth={depth + 1}
                  onRename={onRename}
                  onDelete={onDelete}
                  onCreated={onCreated}
                  onDeckCreated={onDeckCreated}
                  onUnassignDeck={onUnassignDeck}
                  onAddDeckToTopic={onAddDeckToTopic}
                  onRemoveDeckFromTopic={onRemoveDeckFromTopic}
                  onReparent={onReparent}
                  onRenameDeck={onRenameDeck}
                  onResetDecks={onResetDecks}
                  onDeleteDeck={onDeleteDeck}
                />
              )
            })}

            <div className="flex items-center gap-2 flex-wrap">
              <NewTopicForm parentId={topic.id} onCreated={onCreated} />
              <NewDeckForm topicId={topic.id} onCreated={(deck) => onDeckCreated(deck, topic.id)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Unassigned drop zone ───────────────────────────────────────────────────────

function UnassignedDropZone({
  decks,
  allTopics,
  deckTopicMap,
  onAddDeckToTopic,
  onRemoveDeckFromTopic,
  onRenameDeck,
  onResetDecks,
  onDeleteDeck,
}: {
  decks: DeckSummary[]
  allTopics: TopicSummary[]
  deckTopicMap: Map<string, string[]>
  onAddDeckToTopic: (topicId: string, deckId: string) => void
  onRemoveDeckFromTopic: (topicId: string, deckId: string) => void
  onRenameDeck: (deckId: string, name: string) => void
  onResetDecks: (deckIds: string[]) => void
  onDeleteDeck: (deckId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' })
  const [collapsed, setCollapsed] = usePersistedCollapse('unassigned', false)
  const sortableIds = decks.map(d => `deck:unassigned:${d.id}`)
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 border-dashed transition-all mb-4 overflow-hidden
        ${isOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'}
      `}
    >
      <div className="px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-700 transition-colors text-xs w-4 shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <Link
          href="/srs/unassigned"
          className="text-sm font-semibold text-gray-600 hover:text-blue-600 hover:underline"
          title="Open the unassigned decks — bulk file, merge or delete them"
        >
          📂 Unassigned
        </Link>
        <span className="text-xs text-gray-400">
          {decks.length} deck{decks.length === 1 ? '' : 's'} · {decks.reduce((s, d) => s + d.total, 0)} cards
        </span>
      </div>
      <div className={`px-3 pb-3 min-h-8 ${collapsed ? 'hidden' : ''}`}>
        {decks.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2 italic">
            {isOver ? 'Drop here to unassign from all topics' : 'All decks are assigned to topics'}
          </p>
        ) : (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {decks.map((deck, i) => (
                <DeckRow
                  key={`unassigned:${deck.id}`}
                  sortableId={sortableIds[i]}
                  deck={deck}
                  topicActive={true}
                  topicId={null}
                  allTopics={allTopics}
                  currentTopicIds={deckTopicMap.get(deck.id) ?? []}
                  onUnassign={() => {}}
                  onAddToTopic={onAddDeckToTopic}
                  onRemoveFromTopic={onRemoveDeckFromTopic}
                  onRename={onRenameDeck}
                  onReset={onResetDecks}
                  onDeleteDeck={onDeleteDeck}
                />
              ))}
            </ul>
          </SortableContext>
        )}
      </div>
    </div>
  )
}

// ── Main TopicTree component ───────────────────────────────────────────────────

export function TopicTree({
  initialTopics,
  initialParents,
  initialDeckLinks,
  initialDecks,
  rootTopicId,
}: {
  initialTopics:    TopicSummary[]
  initialParents:   TopicParentLink[]
  initialDeckLinks: TopicDeckLink[]
  initialDecks:     DeckSummary[]
  rootTopicId?:     string   // when set, render only this topic's subtree
}) {
  const [topics,    setTopics]    = useState(initialTopics)
  const [parents,   setParents]   = useState(initialParents)
  const [deckLinks, setDeckLinks] = useState(initialDeckLinks)
  const [decks, setDecks]         = useState(initialDecks)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Per-topic ordered deck lists (topicId → deckId[])
  const [topicDeckOrder, setTopicDeckOrder] = useState<Map<string, string[]>>(() => {
    const sorted = [...initialDeckLinks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const m = new Map<string, string[]>()
    for (const dl of sorted) {
      if (!m.has(dl.topicId)) m.set(dl.topicId, [])
      m.get(dl.topicId)!.push(dl.deckId)
    }
    return m
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const topicMap = new Map(topics.map(t => [t.id, t]))
  const deckMap  = new Map(decks.map(d => [d.id, d]))

  const childMap = new Map<string, string[]>()
  for (const p of parents) {
    if (!childMap.has(p.parentId)) childMap.set(p.parentId, [])
    childMap.get(p.parentId)!.push(p.topicId)
  }

  const hasParent = new Set(parents.map(p => p.topicId))

  // deckTopicMap: deckId → [topicId, ...] (for picker + multi-badge)
  const deckTopicMap = new Map<string, string[]>()
  for (const dl of deckLinks) {
    if (!deckTopicMap.has(dl.deckId)) deckTopicMap.set(dl.deckId, [])
    deckTopicMap.get(dl.deckId)!.push(dl.topicId)
  }

  const assignedDeckIds = new Set(deckLinks.map(dl => dl.deckId))

  // When rootTopicId is set, render only the direct children of that topic
  const rootTopicIds = rootTopicId
    ? (childMap.get(rootTopicId) ?? [])
    : topics
        .filter(t => !hasParent.has(t.id))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map(t => t.id)

  const unassignedDecks = decks.filter(d => !assignedDeckIds.has(d.id))

  // Parse a composite drag ID → {topicId, deckId}
  function parseDragId(id: string): { topicId: string; deckId: string } | null {
    // format: "deck:{topicId}:{deckId}"
    const parts = id.split(':')
    if (parts[0] !== 'deck' || parts.length < 3) return null
    // deckId itself can't contain colons (nanoid), topicId uses nanoid too
    // but topicId is parts[1] and deckId is parts[2]
    return { topicId: parts[1], deckId: parts[2] }
  }

  // Persist deck order for a topic (debounced via fire-and-forget)
  function persistOrder(topicId: string, order: string[]) {
    fetch(`/api/srs/topics/${topicId}/decks`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ order }),
    })
  }

  // ── DnD: live reorder within same topic ─────────────────────────────────────

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return

    const activeId  = active.id as string
    const overId    = over.id   as string
    const activeParsed = parseDragId(activeId)
    const overParsed   = parseDragId(overId)

    if (!activeParsed || !overParsed) return
    if (activeParsed.topicId !== overParsed.topicId) return  // cross-topic handled in onDragEnd
    if (activeParsed.deckId  === overParsed.deckId)  return  // same item

    setTopicDeckOrder(prev => {
      const order = prev.get(activeParsed.topicId) ?? []
      const oldIdx = order.indexOf(activeParsed.deckId)
      const newIdx = order.indexOf(overParsed.deckId)
      if (oldIdx < 0 || newIdx < 0) return prev
      const next = arrayMove(order, oldIdx, newIdx)
      const m = new Map(prev)
      m.set(activeParsed.topicId, next)
      return m
    })
  }

  // ── DnD: drop to move between topics ────────────────────────────────────────

  function onDragStart(e: DragStartEvent) {
    setDraggingId(e.active.id as string)
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = e
    if (!over) return

    const activeId = active.id as string
    const overId   = over.id   as string
    const activeParsed = parseDragId(activeId)
    if (!activeParsed) return

    const { topicId: sourceTopicId, deckId } = activeParsed

    // ── Dropped on a topic droppable ──────────────────────────────────────────
    if (overId.startsWith('topic:')) {
      const targetTopicId = overId.slice(6)
      if (targetTopicId === sourceTopicId) return  // same topic, no-op

      // MOVE: remove from source, add to target
      if (sourceTopicId !== 'unassigned') {
        // Remove from source topic
        setDeckLinks(prev => prev.filter(dl => !(dl.topicId === sourceTopicId && dl.deckId === deckId)))
        setTopicDeckOrder(prev => {
          const m = new Map(prev)
          m.set(sourceTopicId, (m.get(sourceTopicId) ?? []).filter(id => id !== deckId))
          return m
        })
        fetch(`/api/srs/topics/${sourceTopicId}/decks/${deckId}`, { method: 'DELETE' })
      }
      // Add to target topic
      const alreadyLinked = deckLinks.some(dl => dl.topicId === targetTopicId && dl.deckId === deckId)
      if (!alreadyLinked) {
        setDeckLinks(prev => [...prev, { topicId: targetTopicId, deckId }])
        setTopicDeckOrder(prev => {
          const m = new Map(prev)
          m.set(targetTopicId, [...(m.get(targetTopicId) ?? []), deckId])
          return m
        })
        fetch(`/api/srs/topics/${targetTopicId}/decks`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ deckId }),
        })
      }
      return
    }

    // ── Dropped on "unassigned" ───────────────────────────────────────────────
    if (overId === 'unassigned') {
      if (sourceTopicId === 'unassigned') return
      setDeckLinks(prev => prev.filter(dl => dl.deckId !== deckId))
      setTopicDeckOrder(prev => {
        const m = new Map(prev)
        for (const [tid] of m) {
          m.set(tid, m.get(tid)!.filter(id => id !== deckId))
        }
        return m
      })
      for (const { topicId } of deckLinks.filter(dl => dl.deckId === deckId)) {
        fetch(`/api/srs/topics/${topicId}/decks/${deckId}`, { method: 'DELETE' })
      }
      return
    }

    // ── Dropped on another deck (same topic) → finalise sort order ────────────
    const overParsed = parseDragId(overId)
    if (overParsed && overParsed.topicId === sourceTopicId) {
      // onDragOver already reordered in state; just persist
      const order = topicDeckOrder.get(sourceTopicId) ?? []
      persistOrder(sourceTopicId, order)
    }
  }

  // ── Topic mutation handlers ──────────────────────────────────────────────────

  function handleRename(topicId: string, name: string) {
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, name } : t))
    fetch(`/api/srs/topics/${topicId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
  }

  function handleDelete(topicId: string) {
    setDeckLinks(prev => prev.filter(dl => dl.topicId !== topicId))
    setTopicDeckOrder(prev => { const m = new Map(prev); m.delete(topicId); return m })
    setParents(prev => prev.filter(p => p.topicId !== topicId && p.parentId !== topicId))
    setTopics(prev => prev.filter(t => t.id !== topicId))
    fetch(`/api/srs/topics/${topicId}`, { method: 'DELETE' })
  }

  function handleRenameDeck(deckId: string, name: string) {
    setDecks(prev => prev.map(d => d.id === deckId ? { ...d, name } : d))
    fetch(`/api/srs/decks/${deckId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    })
  }

  function handleDeleteDeck(deckId: string) {
    setDecks(prev => prev.filter(d => d.id !== deckId))
    setDeckLinks(prev => prev.filter(dl => dl.deckId !== deckId))
    setTopicDeckOrder(prev => {
      const m = new Map(prev)
      for (const [topicId, ids] of m) m.set(topicId, ids.filter(id => id !== deckId))
      return m
    })
  }

  /** A reset makes every card new and due now, so due == total for those decks. */
  function handleResetDecks(deckIds: string[]) {
    const ids = new Set(deckIds)
    setDecks(prev => prev.map(d => ids.has(d.id) ? { ...d, due: d.total } : d))
  }

  function handleReparent(topicId: string, newParentId: string | null, oldParentId: string | null) {
    // Optimistic state update: remove old parent link, add new one
    setParents(prev => {
      let next = oldParentId
        ? prev.filter(p => !(p.topicId === topicId && p.parentId === oldParentId))
        : prev
      if (newParentId) next = [...next, { topicId, parentId: newParentId }]
      return next
    })
    // API calls
    if (oldParentId) {
      fetch(`/api/srs/topics/${topicId}/parents/${oldParentId}`, { method: 'DELETE' })
    }
    if (newParentId) {
      fetch(`/api/srs/topics/${topicId}/parents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ parentId: newParentId }),
      })
    }
  }

  function handleCreated(topic: TopicSummary, parentId: string | null) {
    setTopics(prev => [...prev, topic])
    if (parentId) setParents(prev => [...prev, { topicId: topic.id, parentId }])
  }

  function handleDeckCreated(deck: DeckSummary, topicId: string) {
    setDecks(prev => [...prev, deck])
    setDeckLinks(prev => [...prev, { topicId, deckId: deck.id }])
    setTopicDeckOrder(prev => {
      const m = new Map(prev)
      m.set(topicId, [...(m.get(topicId) ?? []), deck.id])
      return m
    })
  }

  function handleUnassignDeck(topicId: string, deckId: string) {
    setDeckLinks(prev => prev.filter(dl => !(dl.topicId === topicId && dl.deckId === deckId)))
    setTopicDeckOrder(prev => {
      const m = new Map(prev)
      m.set(topicId, (m.get(topicId) ?? []).filter(id => id !== deckId))
      return m
    })
    fetch(`/api/srs/topics/${topicId}/decks/${deckId}`, { method: 'DELETE' })
  }

  function handleAddDeckToTopic(topicId: string, deckId: string) {
    if (deckLinks.some(dl => dl.topicId === topicId && dl.deckId === deckId)) return
    setDeckLinks(prev => [...prev, { topicId, deckId }])
    setTopicDeckOrder(prev => {
      const m = new Map(prev)
      m.set(topicId, [...(m.get(topicId) ?? []), deckId])
      return m
    })
    fetch(`/api/srs/topics/${topicId}/decks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ deckId }),
    })
  }

  function handleRemoveDeckFromTopic(topicId: string, deckId: string) {
    handleUnassignDeck(topicId, deckId)
  }

  // Get the deck being dragged (for overlay)
  const draggingParsed = draggingId ? parseDragId(draggingId) : null
  const draggingDeck   = draggingParsed ? deckMap.get(draggingParsed.deckId) : null

  // When in focused topic view: render root's own decks + child sub-topics
  const focusedRootDeckIds = rootTopicId ? (topicDeckOrder.get(rootTopicId) ?? []) : []
  const focusedRootDecks   = focusedRootDeckIds.map(id => deckMap.get(id)).filter(Boolean) as DeckSummary[]
  const focusedChildIds    = rootTopicId ? (childMap.get(rootTopicId) ?? []) : []

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {rootTopicId ? (
        // ── Focused topic view ────────────────────────────────────────────────
        <>
          {/* Direct decks of this topic */}
          {focusedRootDecks.length > 0 && (
            <SortableContext
              items={focusedRootDeckIds.map(id => `deck:${rootTopicId}:${id}`)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-1 mb-4">
                {focusedRootDecks.map((deck, i) => (
                  <DeckRow
                    key={`${rootTopicId}:${deck.id}`}
                    sortableId={`deck:${rootTopicId}:${focusedRootDeckIds[i]}`}
                    deck={deck}
                    topicActive={true}
                    topicId={rootTopicId}
                    allTopics={topics}
                    currentTopicIds={deckTopicMap.get(deck.id) ?? []}
                    onUnassign={handleUnassignDeck}
                    onAddToTopic={handleAddDeckToTopic}
                    onRemoveFromTopic={handleRemoveDeckFromTopic}
                    onRename={handleRenameDeck}
                    onReset={handleResetDecks}
                    onDeleteDeck={handleDeleteDeck}
                  />
                ))}
              </ul>
            </SortableContext>
          )}

          {/* Child sub-topics */}
          {focusedChildIds.map(childId => {
            const child = topicMap.get(childId)
            if (!child) return null
            return (
              <TopicNode
                key={childId}
                topic={child}
                parentId={rootTopicId ?? null}
                childMap={childMap}
                topicDeckOrder={topicDeckOrder}
                deckTopicMap={deckTopicMap}
                allTopics={topicMap}
                allDecks={deckMap}
                depth={0}
                onRename={handleRename}
                onDelete={handleDelete}
                onCreated={handleCreated}
                onDeckCreated={handleDeckCreated}
                onUnassignDeck={handleUnassignDeck}
                onAddDeckToTopic={handleAddDeckToTopic}
                onRemoveDeckFromTopic={handleRemoveDeckFromTopic}
                onReparent={handleReparent}
                onRenameDeck={handleRenameDeck}
                onResetDecks={handleResetDecks}
                onDeleteDeck={handleDeleteDeck}
              />
            )
          })}

          {focusedRootDecks.length === 0 && focusedChildIds.length === 0 && (
            <p className="text-sm text-gray-400 italic py-4 text-center">
              No decks yet — drag some here, add a deck, or add a sub-topic below.
            </p>
          )}

          <div className="mt-2 mb-6 flex items-center gap-2 flex-wrap">
            <NewTopicForm parentId={rootTopicId} onCreated={handleCreated} />
            <NewDeckForm topicId={rootTopicId!} onCreated={(deck) => handleDeckCreated(deck, rootTopicId!)} />
          </div>
        </>
      ) : (
        // ── Full tree view ────────────────────────────────────────────────────
        <>
          {rootTopicIds.map(topicId => {
            const topic = topicMap.get(topicId)
            if (!topic) return null
            return (
              <TopicNode
                key={topicId}
                topic={topic}
                parentId={null}
                childMap={childMap}
                topicDeckOrder={topicDeckOrder}
                deckTopicMap={deckTopicMap}
                allTopics={topicMap}
                allDecks={deckMap}
                depth={0}
                onRename={handleRename}
                onDelete={handleDelete}
                onCreated={handleCreated}
                onDeckCreated={handleDeckCreated}
                onUnassignDeck={handleUnassignDeck}
                onAddDeckToTopic={handleAddDeckToTopic}
                onRemoveDeckFromTopic={handleRemoveDeckFromTopic}
                onReparent={handleReparent}
                onRenameDeck={handleRenameDeck}
                onResetDecks={handleResetDecks}
                onDeleteDeck={handleDeleteDeck}
              />
            )
          })}

          <UnassignedDropZone
            decks={unassignedDecks}
            allTopics={topics}
            deckTopicMap={deckTopicMap}
            onAddDeckToTopic={handleAddDeckToTopic}
            onRemoveDeckFromTopic={handleRemoveDeckFromTopic}
            onRenameDeck={handleRenameDeck}
            onResetDecks={handleResetDecks}
            onDeleteDeck={handleDeleteDeck}
          />

          <div className="mt-2 mb-6">
            <NewTopicForm parentId={null} onCreated={handleCreated} label="+ new topic" />
          </div>
        </>
      )}

      <DragOverlay>
        {draggingDeck && <DeckGhost deck={draggingDeck} />}
      </DragOverlay>
    </DndContext>
  )
}
