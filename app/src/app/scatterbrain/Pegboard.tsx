'use client'

/**
 * The whole work at a glance. Each act is a column, each chapter a band inside
 * it, each scene a card. Dragging a card moves it in the binder: there is only
 * one order.
 */
import { useMemo, useState } from 'react'
import { imageSrc } from '@/lib/porcupin/types'
import { isContainer, KIND_LABEL, STATUS_LABEL, type AttachmentView, type CharacterView, type ItemStatus, type ItemView } from '@/lib/scatterbrain/types'
import type { Actions } from './Workspace'

const ITEM_TYPE = 'application/x-scatterbrain-item'

const STATUS_BAR: Record<ItemStatus, string> = {
  idea: 'bg-gray-300',
  draft: 'bg-amber-400',
  revised: 'bg-sky-500',
  done: 'bg-emerald-500',
}

const SIZES = [
  { label: 'S', card: 'w-36', column: 'w-44', clamp: 'line-clamp-2' },
  { label: 'M', card: 'w-52', column: 'w-60', clamp: 'line-clamp-4' },
  { label: 'L', card: 'w-72', column: 'w-80', clamp: 'line-clamp-[8]' },
]

type Band = { container: ItemView | null; path: string; cards: ItemView[] }
type Column = { head: ItemView | null; bands: Band[] }

export default function Pegboard({ items, characters, attachments, selectedId, actions, onOpen }: {
  items: ItemView[]
  characters: CharacterView[]
  attachments: AttachmentView[]
  selectedId: string | null
  actions: Actions
  onOpen: (id: string) => void
}) {
  const [size, setSize] = useState(1)
  const [castFilter, setCastFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [target, setTarget] = useState<string | null>(null)

  const children = useMemo(() => {
    const map = new Map<string | null, ItemView[]>()
    for (const item of items) map.set(item.parentId, [...(map.get(item.parentId) ?? []), item])
    return map
  }, [items])

  const columns = useMemo(() => {
    const bandsUnder = (container: ItemView, path: string): Band[] => {
      const kids = children.get(container.id) ?? []
      const own: Band = { container, path, cards: kids.filter((k) => !isContainer(k.kind)) }
      const nested = kids.filter((k) => isContainer(k.kind)).flatMap((k) => bandsUnder(k, path ? `${path} / ${k.title}` : k.title))
      return [own, ...nested]
    }
    const roots = children.get(null) ?? []
    const result: Column[] = roots.filter((r) => isContainer(r.kind)).map((head) => ({ head, bands: bandsUnder(head, '') }))
    const loose = roots.filter((r) => !isContainer(r.kind))
    if (loose.length) result.unshift({ head: null, bands: [{ container: null, path: '', cards: loose }] })
    return result
  }, [children])

  const firstImage = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of attachments) {
      const key = a.itemId ?? (a.characterId ? `c:${a.characterId}` : null)
      if (key && !map.has(key)) map.set(key, a.pinId)
    }
    return map
  }, [attachments])

  const matches = (item: ItemView) =>
    (!castFilter || item.characterIds.includes(castFilter) || item.povCharacterId === castFilter) &&
    (!statusFilter || item.status === statusFilter)

  const filtering = !!castFilter || !!statusFilter
  const dim = SIZES[size]

  const dragOver = (e: React.DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes(ITEM_TYPE)) return
    e.preventDefault()
    e.stopPropagation()
    setTarget(key)
  }
  const dropOn = (e: React.DragEvent, parentId: string | null, beforeId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setTarget(null)
    const dragged = e.dataTransfer.getData(ITEM_TYPE)
    if (dragged && dragged !== beforeId) void actions.move(dragged, parentId, beforeId)
  }

  const renderCard = (card: ItemView, parentId: string | null) => {
    const picture = firstImage.get(card.id)
    const cast = [...new Set([card.povCharacterId, ...card.characterIds].filter(Boolean) as string[])]
    return (
      <div
        key={card.id}
        draggable
        role="button"
        tabIndex={0}
        aria-label={`${card.title}, ${STATUS_LABEL[card.status]}`}
        onDragStart={(e) => {
          e.dataTransfer.setData(ITEM_TYPE, card.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => dragOver(e, `card:${card.id}`)}
        onDragLeave={() => setTarget(null)}
        onDrop={(e) => dropOn(e, parentId, card.id)}
        onClick={() => actions.select(card.id)}
        onDoubleClick={() => onOpen(card.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(card.id) }}
        className={`relative ${dim.card} cursor-grab overflow-hidden rounded-md border bg-amber-50/60 text-left shadow-sm transition hover:shadow ${
          selectedId === card.id ? 'border-purple-500 ring-1 ring-purple-500' : 'border-stone-300'
        } ${filtering && !matches(card) ? 'opacity-25' : ''} ${target === `card:${card.id}` ? 'mt-3 border-t-2 border-t-purple-500' : ''}`}
      >
        <div className={`h-1 ${STATUS_BAR[card.status]}`} />
        {picture && size > 0 && <img src={imageSrc(picture, 'thumb')} alt="" loading="lazy" draggable={false} className="h-20 w-full object-cover" />}
        <div className="p-2">
          <div className="text-sm font-semibold leading-snug text-gray-900">{card.title}</div>
          {card.synopsis && <p className={`mt-1 text-xs leading-snug text-gray-600 ${dim.clamp}`}>{card.synopsis}</p>}
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500">
            <span>{STATUS_LABEL[card.status]}</span>
            {(card.wordCount > 0 || card.targetWords) && <span className="tabular-nums">· {card.wordCount.toLocaleString()}{card.targetWords ? ` / ${card.targetWords.toLocaleString()}` : ''}</span>}
            {card.orgPath && <span className="text-emerald-700">· org</span>}
            <span className="ml-auto flex -space-x-1">
              {cast.slice(0, 4).map((id) => {
                const person = characters.find((c) => c.id === id)
                const portrait = firstImage.get(`c:${id}`)
                return portrait
                  ? <img key={id} src={imageSrc(portrait, 'thumb')} alt={person?.name ?? ''} title={person?.name} draggable={false} className="h-5 w-5 rounded-full border border-white object-cover" />
                  : <span key={id} title={person?.name} className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-purple-200 text-[10px] font-medium text-purple-900">{person?.name[0] ?? '?'}</span>
              })}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const renderBand = (band: Band, columnHead: ItemView | null) => {
    const parentId = band.container?.id ?? null
    const key = `band:${parentId}`
    return (
      <section
        key={key}
        onDragOver={(e) => dragOver(e, key)}
        onDragLeave={() => setTarget(null)}
        onDrop={(e) => dropOn(e, parentId, null)}
        className={`rounded-lg p-1.5 ${target === key ? 'bg-purple-100' : ''}`}
      >
        {band.container && band.container.id !== columnHead?.id && (
          <button onClick={() => actions.select(band.container!.id)} className="mb-1 block w-full truncate text-left text-xs font-semibold text-stone-700 hover:text-purple-700">
            {band.path}
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {band.cards.map((card) => renderCard(card, parentId))}
          {band.cards.length === 0 && <p className="px-1 py-2 text-xs text-stone-500">Empty. Drop a card here.</p>}
        </div>
      </section>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-1.5 text-sm">
        <div role="group" aria-label="Card size" className="flex rounded-md border border-gray-200">
          {SIZES.map((s, i) => (
            <button key={s.label} aria-pressed={size === i} onClick={() => setSize(i)} className={`px-2 py-0.5 text-xs ${size === i ? 'bg-gray-200 font-medium text-gray-900' : 'text-gray-600'}`}>{s.label}</button>
          ))}
        </div>
        <label className="text-xs text-gray-600">
          Character{' '}
          <select value={castFilter} onChange={(e) => setCastFilter(e.target.value)} className="rounded border border-gray-200 bg-white px-1 py-0.5 text-xs">
            <option value="">Everyone</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Status{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-gray-200 bg-white px-1 py-0.5 text-xs">
            <option value="">Any</option>
            {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-gray-500">Click a card for details, double-click to write, drag to move it.</span>
      </div>

      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-auto bg-stone-200/70 p-3">
        {columns.length === 0 && <p className="m-auto text-sm text-stone-600">Add acts and scenes in the binder and they will appear here.</p>}
        {columns.map((column) => (
          <div key={column.head?.id ?? 'loose'} className={`${dim.column} shrink-0 rounded-lg bg-stone-100 p-1.5 shadow-sm`}>
            <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
              {column.head ? (
                <button onClick={() => actions.select(column.head!.id)} className="truncate text-left text-sm font-bold text-stone-800 hover:text-purple-700">{column.head.title}</button>
              ) : <span className="text-sm font-bold text-stone-600">Loose</span>}
              {column.head && (
                <button
                  title={`Add a scene to ${column.head.title}`}
                  aria-label={`Add a scene to ${column.head.title}`}
                  onClick={() => void actions.addItem(column.head!.id, 'scene')}
                  className="h-5 w-5 shrink-0 rounded text-stone-500 hover:bg-white hover:text-purple-700"
                >
                  +
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {column.bands
                // An act holding only chapters has no cards of its own to show.
                .filter((band) => band.cards.length > 0 || band.container?.id !== column.head?.id || column.bands.length === 1)
                .map((band) => renderBand(band, column.head))}
            </div>
            {column.head && <span className="sr-only">{KIND_LABEL[column.head.kind]}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
