'use client'

import { useState } from 'react'
import type { OrgGraphLink, OrgGraphNode } from './orgGraph'

/**
 * Every link the selected note has, with what each one means.
 *
 * The label is edited here rather than on the edge itself: an edge is a
 * one-pixel line that is hard to hit and easy to lose among a hundred others,
 * while a list is somewhere you can read down and fill in the unlabelled ones.
 * Incoming links are editable too — the write lands in the other note, which
 * is where that link lives.
 */
export default function ConnectionsPanel({
  node, links, titles, onSelect, onSave,
}: {
  node: OrgGraphNode
  links: OrgGraphLink[]
  titles: Map<string, string>
  onSelect: (id: string) => void
  onSave: (link: OrgGraphLink, label: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mine = links.filter(l => l.source === node.id || l.dest === node.id)
  if (mine.length === 0) return null
  const labelled = mine.filter(l => l.label).length

  const commit = async (l: OrgGraphLink) => {
    setError(null)
    try {
      await onSave(l, draft.trim())
      setEditing(null)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }

  return (
    <div className="px-3 py-2 border-b border-gray-100">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Connections · {labelled}/{mine.length} labelled
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {mine.map(l => {
          const out = l.source === node.id
          const other = out ? l.dest : l.source
          const key = `${l.source}->${l.dest}`
          return (
            <div key={key} className="flex items-center gap-1 text-[11px] leading-snug">
              <span className="text-gray-400 flex-shrink-0 w-3">{out ? '→' : '←'}</span>
              {editing === key ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commit(l)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onBlur={() => setEditing(null)}
                  placeholder="label"
                  className="w-24 flex-shrink-0 text-[11px] border border-indigo-300 rounded px-1 focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => { setEditing(key); setDraft(l.label ?? ''); setError(null) }}
                  title="Edit what this link means"
                  className={`flex-shrink-0 max-w-[6rem] truncate rounded px-1 ${
                    l.label
                      ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                      : 'text-gray-300 hover:text-indigo-500'
                  }`}>
                  {l.label ?? '+ label'}
                </button>
              )}
              <button onClick={() => onSelect(other)}
                className="flex-1 min-w-0 text-left truncate text-gray-700 hover:underline">
                {titles.get(other) ?? '?'}
              </button>
            </div>
          )
        })}
      </div>
      {error && <div className="text-[10px] text-red-600 mt-1 break-words">{error}</div>}
    </div>
  )
}
