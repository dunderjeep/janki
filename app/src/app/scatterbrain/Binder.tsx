'use client'

import { useMemo, useState } from 'react'
import { isContainer, KIND_LABEL, type AttachmentView, type ItemKind, type ItemView } from '@/lib/scatterbrain/types'
import type { Actions } from './Workspace'

const ITEM_TYPE = 'application/x-scatterbrain-item'
const GLYPH: Record<ItemKind, string> = { part: '▣', act: '▤', chapter: '▥', scene: '¶', note: '✎' }
const CHILD_KIND: Partial<Record<ItemKind, ItemKind>> = { part: 'act', act: 'chapter', chapter: 'scene' }

type Spot = { id: string; zone: 'before' | 'after' | 'into' } | null

export default function Binder({ items, selectedId, actions }: {
  items: ItemView[]
  selectedId: string | null
  attachments: AttachmentView[]
  actions: Actions
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [spot, setSpot] = useState<Spot>(null)

  const children = useMemo(() => {
    const map = new Map<string | null, ItemView[]>()
    for (const item of items) map.set(item.parentId, [...(map.get(item.parentId) ?? []), item])
    return map
  }, [items])

  const isWithin = (id: string, ancestor: string): boolean => {
    for (let at: string | null = id; at; at = items.find((i) => i.id === at)?.parentId ?? null) {
      if (at === ancestor) return true
    }
    return false
  }

  const drop = (e: React.DragEvent, target: ItemView, zone: 'before' | 'after' | 'into') => {
    e.preventDefault()
    setSpot(null)
    const dragged = e.dataTransfer.getData(ITEM_TYPE)
    if (!dragged || isWithin(target.id, dragged)) return
    if (zone === 'into') {
      void actions.move(dragged, target.id, null)
      return
    }
    const siblings = (children.get(target.parentId) ?? []).filter((s) => s.id !== dragged)
    const at = siblings.findIndex((s) => s.id === target.id)
    const before = zone === 'before' ? target.id : siblings[at + 1]?.id ?? null
    void actions.move(dragged, target.parentId, before)
  }

  const zoneFor = (e: React.DragEvent, item: ItemView): 'before' | 'after' | 'into' => {
    const box = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - box.top) / box.height
    if (isContainer(item.kind) && y > 0.25 && y < 0.75) return 'into'
    return y < 0.5 ? 'before' : 'after'
  }

  const renderRow = (item: ItemView, depth: number) => {
    const kids = children.get(item.id) ?? []
    const open = !closed.has(item.id)
    const here = spot?.id === item.id ? spot.zone : null
    const words = kids.length === 0 ? item.wordCount : null
    const childKind = CHILD_KIND[item.kind]
    return (
      <li key={item.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ITEM_TYPE, item.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(ITEM_TYPE)) return
            e.preventDefault()
            const zone = zoneFor(e, item)
            setSpot((s) => (s?.id === item.id && s.zone === zone ? s : { id: item.id, zone }))
          }}
          onDragLeave={() => setSpot((s) => (s?.id === item.id ? null : s))}
          onDrop={(e) => drop(e, item, zoneFor(e, item))}
          style={{ paddingLeft: depth * 14 + 6 }}
          className={`group relative flex items-center gap-1 rounded py-1 pr-1 text-sm ${
            selectedId === item.id ? 'bg-purple-100 text-purple-950' : 'text-gray-800 hover:bg-gray-100'
          } ${here === 'into' ? 'ring-2 ring-inset ring-purple-400' : ''}`}
        >
          {here === 'before' && <span className="absolute inset-x-0 top-0 h-0.5 bg-purple-500" />}
          {here === 'after' && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-500" />}
          {kids.length > 0 ? (
            <button
              aria-label={open ? `Collapse ${item.title}` : `Expand ${item.title}`}
              aria-expanded={open}
              onClick={() => setClosed((c) => {
                const next = new Set(c)
                if (open) next.add(item.id)
                else next.delete(item.id)
                return next
              })}
              className="w-4 shrink-0 text-xs text-gray-400 hover:text-gray-700"
            >
              {open ? '▾' : '▸'}
            </button>
          ) : <span className="w-4 shrink-0" />}
          <button onClick={() => actions.select(item.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span aria-hidden className={`shrink-0 text-xs ${item.orgPath ? 'text-emerald-600' : 'text-gray-400'}`} title={item.orgPath ?? KIND_LABEL[item.kind]}>{GLYPH[item.kind]}</span>
            <span className={`truncate ${isContainer(item.kind) ? 'font-medium' : ''}`}>{item.title}</span>
          </button>
          {words !== null && words > 0 && <span className="shrink-0 text-[11px] tabular-nums text-gray-400 group-hover:hidden">{words.toLocaleString()}</span>}
          {childKind && (
            <button
              title={`Add ${KIND_LABEL[childKind].toLowerCase()}`}
              aria-label={`Add ${KIND_LABEL[childKind].toLowerCase()} to ${item.title}`}
              onClick={() => void actions.addItem(item.id, childKind)}
              className="hidden h-5 w-5 shrink-0 rounded text-gray-500 hover:bg-white hover:text-purple-700 focus:block group-hover:block"
            >
              +
            </button>
          )}
        </div>
        {kids.length > 0 && open && <ul>{kids.map((kid) => renderRow(kid, depth + 1))}</ul>}
      </li>
    )
  }

  const addButtons: ItemKind[] = ['part', 'act', 'chapter', 'scene', 'note']

  return (
    <aside aria-label="Binder" className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {(children.get(null) ?? []).length === 0
          ? <p className="p-2 text-sm text-gray-500">Nothing here yet. Add something below.</p>
          : <ul>{(children.get(null) ?? []).map((item) => renderRow(item, 0))}</ul>}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-gray-200 p-2">
        <span className="w-full text-[11px] font-medium uppercase tracking-wide text-gray-400">Add at top level</span>
        {addButtons.map((kind) => (
          <button
            key={kind}
            onClick={() => void actions.addItem(null, kind)}
            className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:border-purple-300 hover:text-purple-700"
          >
            {KIND_LABEL[kind]}
          </button>
        ))}
      </div>
    </aside>
  )
}
