'use client'

import { useMemo, useState } from 'react'
import type { ChainIndex } from '@/lib/chains/tree'

/** The headings a step links to and waits for, as chips. */
export function LinkChips({ links, waits, index, onJump, onRemove }: {
  links: string[]
  waits: string[]
  index?: ChainIndex
  onJump?: (id: string) => void
  onRemove?: (id: string, kind: 'link' | 'wait') => void
}) {
  if (!links.length && !waits.length) return null
  const chip = (id: string, kind: 'link' | 'wait') => {
    const it = index?.[id]
    const label = it ? it.title : 'a heading that is gone'
    return (
      <span key={`${kind}:${id}`}
        className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
          kind === 'wait'
            ? it && !it.done ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 text-gray-400'
            : 'border-violet-200 bg-violet-50 text-violet-900'}`}>
        <button className={`truncate text-left ${it?.done ? 'line-through' : ''}`} disabled={!it || !onJump}
          title={it ? [...it.path, it.title].join(' › ') : id}
          onClick={(e) => { e.stopPropagation(); if (it) onJump?.(id) }}>
          {kind === 'wait' ? 'waits for ' : '↔ '}{label}
        </button>
        {onRemove && (
          <button className="shrink-0 opacity-60 hover:opacity-100" aria-label="Remove link"
            onClick={(e) => { e.stopPropagation(); onRemove(id, kind) }}>×</button>
        )}
      </span>
    )
  }
  return <div className="mt-0.5 flex flex-wrap gap-1">{waits.map((id) => chip(id, 'wait'))}{links.map((id) => chip(id, 'link'))}</div>
}

export type PickOption = { id: string | null; label: string; detail?: string; done?: boolean }

/** A filtered list to choose one heading from. */
export function Picker({ options, placeholder, onPick, onClose, footer }: {
  options: PickOption[]
  placeholder: string
  onPick: (o: PickOption) => void
  onClose: () => void
  footer?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return options.filter((o) => words.every((w) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(w))).slice(0, 60)
  }, [q, options])
  return (
    <div className="mt-1 rounded-md border border-gray-200 bg-white p-2 shadow-sm" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && shown[0]) onPick(shown[0])
          }}
          className="min-w-0 flex-1 rounded border border-sky-300 px-2 py-1 text-sm focus:outline-none" />
        <button className="text-xs text-gray-500 hover:text-gray-800" onClick={onClose}>Close</button>
      </div>
      {footer}
      <ul className="mt-1 max-h-60 overflow-y-auto text-sm">
        {shown.map((o) => (
          <li key={o.id ?? '(top)'}>
            <button className="block w-full rounded px-1.5 py-1 text-left hover:bg-sky-50" onClick={() => onPick(o)}>
              <span className={o.done ? 'text-gray-400 line-through' : 'text-gray-900'}>{o.label}</span>
              {o.detail && <span className="block text-[11px] text-gray-500">{o.detail}</span>}
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-1.5 py-1 text-xs text-gray-500">Nothing matches.</li>}
      </ul>
    </div>
  )
}

/** Every heading in the index except some, as picker options, open ones first. */
export function linkOptions(index: ChainIndex, except: Set<string>, domainTitles: Record<string, string>): PickOption[] {
  return Object.entries(index)
    .filter(([id]) => !except.has(id))
    .map(([id, it]) => ({ id, label: it.title, done: it.done, detail: [domainTitles[it.domain] ?? it.domain, ...it.path].join(' › ') }))
    .sort((a, b) => Number(a.done) - Number(b.done))
}
