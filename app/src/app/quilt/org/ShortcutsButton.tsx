'use client'

import { useCallback, useEffect, useState } from 'react'

type Shortcut = { key: string | null; text: string }

/**
 * The bindings this project added.
 *
 * Kept here rather than expected in keyboard_shortcuts.org: that file is a
 * hand-written cheat sheet, and something added by a tool should not silently
 * depend on the person having written it down.
 */
const FOCUS_KEYS: { key: string; text: string }[] = [
  { key: 'C-c q', text: 'Add a birthday, bill, or repeating task — asks which, writes the right shape' },
  { key: 'C-c c t', text: 'Capture a task (no date)' },
  { key: 'C-c c s', text: 'Capture a task with a date' },
  { key: 'C-c c w', text: 'Capture a weekly repeating task' },
  { key: 'C-c c l', text: 'Capture a task linked back to where you are' },
  { key: 'M-x quilt/show-in-graph', text: 'Find this note on the Focus canvas' },
  { key: 'M-x quilt/pull-to-horizon', text: 'Pull a note into today / week / month / year / goals' },
  { key: 'M-x quilt/open-graph', text: 'Open the Focus canvas' },
]

function Row({ s }: { s: Shortcut }) {
  if (!s.key) {
    return <div className="text-[11px] text-gray-500 py-0.5 pl-1">{s.text}</div>
  }
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <kbd className="flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200
                      text-[10px] font-mono text-gray-700 whitespace-nowrap">
        {s.key}
      </kbd>
      <span className="text-[11px] text-gray-600 min-w-0">{s.text}</span>
    </div>
  )
}

export default function ShortcutsButton() {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Shortcut[] | null>(null)
  const [file, setFile] = useState<string>('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open || list) return
    fetch('/api/org/shortcuts')
      .then(r => r.json())
      .then(d => { setList(d.shortcuts ?? []); setFile(d.file ?? '') })
      .catch(() => setList([]))
  }, [open, list])

  // Escape closes, as it does everywhere else on this page.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const match = useCallback((s: { key: string | null; text: string }) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return `${s.key ?? ''} ${s.text}`.toLowerCase().includes(q)
  }, [query])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Keyboard shortcuts"
        className="w-full text-left text-[10px] text-gray-400 hover:text-indigo-600 px-3 py-1"
      >
        ⌨ Keyboard shortcuts
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-[min(680px,92vw)] max-h-[82vh]
                       flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Keyboard shortcuts</span>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter…"
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1
                           focus:outline-none focus:border-indigo-400"
              />
              <button onClick={() => setOpen(false)}
                className="text-gray-300 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="overflow-y-auto px-4 py-3">
              <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
                Focus
              </div>
              {FOCUS_KEYS.filter(match).map(s => <Row key={s.key} s={s} />)}

              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide
                              mt-4 mb-1 pt-3 border-t border-gray-100">
                Yours
                {file && (
                  <span className="ml-1 font-normal normal-case text-gray-300">
                    {file.split('/').pop()}
                  </span>
                )}
              </div>
              {!list && <p className="text-[11px] text-gray-400">Reading…</p>}
              {list?.filter(match).map((s, i) => <Row key={i} s={s} />)}
              {list && list.filter(match).length === 0 && (
                <p className="text-[11px] text-gray-400">Nothing matches.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
