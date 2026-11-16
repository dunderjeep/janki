'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type AgendaEntry = {
  text: string; heading: string
  todo: string | null; type: string | null; priority: string | null
  file: string; pos: number
  /** The nearest linkable note, to open on the canvas. */
  node?: string | null
}
type Agenda = {
  date: string; entries: AgendaEntry[]; available: boolean; error?: string
  /** The agenda notes: where entries get set. */
  files?: string[]
}
type DayStat = { date: string; done: number; total: number }

function iso(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0')].join('-')
}

/** Routine completion → the same green the sparks use, faded by how little was done. */
function dayShade(s: DayStat | undefined): string | undefined {
  if (!s || s.total === 0) return undefined
  const r = s.done / s.total
  if (r === 0) return '#f3f4f6'
  return `rgba(22,163,74,${0.15 + r * 0.55})`
}

/** org's own entry classes, in the order they deserve attention. */
const TYPE_ORDER = ['deadline', 'upcoming-deadline', 'past-scheduled', 'scheduled', 'timestamp']
const TYPE_LABEL: Record<string, string> = {
  'deadline': 'Deadline',
  'upcoming-deadline': 'Deadline soon',
  'past-scheduled': 'Overdue',
  'scheduled': 'Scheduled',
  'sexp': 'Anniversary',
  'timestamp': 'Timestamped',
}
const TYPE_COLOR: Record<string, string> = {
  'deadline': '#dc2626',
  'upcoming-deadline': '#ea580c',
  'past-scheduled': '#d97706',
  'scheduled': '#0d9488',
  'timestamp': '#6b7280',
}

/** Org link syntax is for org; the page wants the words. */
function clean(s: string): string {
  return s.replace(/\[\[(?:[^\]]*)\]\[([^\]]*)\]\]|\[\[([^\]]*)\]\]/g, (_, a, b) => a || b || '')
    .replace(/\s+/g, ' ').trim()
}

/**
 * A month, and the agenda for whichever day is picked.
 *
 * The calendar is not decoration: each day is shaded by how much of that day's
 * routine got done, so three years of dailies become something you can look
 * across. Clicking a day loads its agenda here and opens its daily on the canvas.
 */
export default function CalendarPanel({
  onPeekDay, onPeekEntry,
}: {
  /** Opens a date's daily on the canvas. */
  onPeekDay: (date: string) => void
  /** Opens an agenda entry where it is defined. */
  onPeekEntry: (file: string, pos: number, node: string | null) => void
}) {
  const [days, setDays] = useState<DayStat[]>([])
  useEffect(() => {
    fetch('/api/org/routine/history')
      .then(r => r.json())
      .then(h => setDays(h.daily ?? []))
      .catch(() => {})
  }, [])

  const today = useMemo(() => iso(new Date()), [])
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(today)
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])

  const load = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/org/agenda?date=${date}`)
      setAgenda(await res.json())
    } catch {
      setAgenda({ date, entries: [], available: false, error: 'Request failed' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(selected) }, [selected, load])

  const grid = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first)
    // Monday-first, matching org's default week start.
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [month])

  const setDone = useCallback(async (e: AgendaEntry) => {
    const key = `${e.file}:${e.pos}`
    setBusy(key)
    try {
      await fetch('/api/org/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: e.file, pos: e.pos, state: 'DONE' }),
      })
      await load(selected)
    } finally {
      setBusy(null)
    }
  }, [load, selected])

  const grouped = useMemo(() => {
    const g = new Map<string, AgendaEntry[]>()
    for (const e of agenda?.entries ?? []) {
      const k = e.type ?? 'other'
      const bucket = g.get(k)
      if (bucket) bucket.push(e)
      else g.set(k, [e])
    }
    return [...g.entries()].sort(
      (a, b) => (TYPE_ORDER.indexOf(a[0]) + 99) % 99 - (TYPE_ORDER.indexOf(b[0]) + 99) % 99)
  }, [agenda])

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="border-t border-gray-100">
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">‹</button>
          <span className="text-[11px] font-semibold text-gray-600">{monthLabel}</span>
          <button
            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">›</button>
        </div>

        <div className="grid grid-cols-7 gap-[2px] text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="text-[9px] text-gray-300">{d}</span>
          ))}
          {grid.map(d => {
            const key = iso(d)
            const inMonth = d.getMonth() === month.getMonth()
            const stat = byDate.get(key)
            return (
              <button
                key={key}
                onClick={() => { setSelected(key); onPeekDay(key) }}
                title={stat ? `${key} — routine ${stat.done}/${stat.total}` : key}
                className={`aspect-square rounded text-[9px] flex items-center justify-center
                            transition-colors ${
                  key === selected ? 'ring-1 ring-indigo-500' : ''
                } ${
                  inMonth ? 'text-gray-700' : 'text-gray-300'
                } ${key === today ? 'font-bold text-red-600' : ''} hover:bg-gray-100`}
                style={{ backgroundColor: inMonth ? dayShade(stat) : undefined }}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>
        <p className="text-[9px] text-gray-400 mt-1 leading-snug">
          Shaded by routine done that day. Click a day for its agenda and daily.
        </p>
      </div>

      <div className="px-3 pb-2 border-t border-gray-100 pt-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Agenda</span>
          <span className="text-[10px] text-gray-400">{selected}</span>
        </div>

        {loading && <p className="text-[10px] text-gray-400">Loading…</p>}

        {!loading && agenda && !agenda.available && (
          <p className="text-[10px] text-amber-600 leading-snug">{agenda.error}</p>
        )}

        {!loading && agenda?.available && agenda.entries.length === 0 && (
          <p className="text-[10px] text-gray-400">Nothing on the agenda.</p>
        )}

        {/* The files org actually reads. This is the answer to "where do I put
            a task?", so it belongs on screen rather than in a doc somewhere. */}
        {(agenda?.files?.length ?? 0) > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-100">
            <div className="text-[9px] text-gray-400 mb-0.5">Set in</div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {agenda!.files!.map(f => (
                <button key={f} onClick={() => onPeekEntry(f, 0, null)} title={f}
                  className="text-[10px] text-indigo-600 hover:underline">
                  {f.split('/').pop()}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && grouped.map(([type, entries]) => (
          <div key={type} className="mb-1.5">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide"
                style={{ color: TYPE_COLOR[type] ?? '#6b7280' }}>
                {TYPE_LABEL[type] ?? type} · {entries.length}
              </span>
              <span className="text-[9px] text-gray-300 truncate max-w-[55%]"
                title={[...new Set(entries.map(e => e.file))].join('\n')}>
                {[...new Set(entries.map(e => e.file.split('/').pop()))].join(', ')}
              </span>
            </div>
            {entries.slice(0, 40).map(e => {
              const key = `${e.file}:${e.pos}`
              const done = e.todo === 'DONE'
              return (
                <div key={key} className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50">
                  <button
                    onClick={() => setDone(e)}
                    disabled={busy === key || done}
                    title={done ? 'Already done' : 'Mark DONE'}
                    className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center
                                justify-center text-[8px] font-bold disabled:opacity-40 ${
                      done ? 'bg-green-600 border-green-600 text-white'
                           : 'border-gray-300 text-transparent hover:border-green-500'
                    }`}
                  >
                    ✓
                  </button>
                  {/* Answers "where is this set?" — opens the entry itself,
                      in the file and at the position the agenda came from. */}
                  <button
                    onClick={() => onPeekEntry(e.file, e.pos, e.node ?? null)}
                    title={`${clean(e.heading)}\n${e.file.split('/').pop()} — click to open where it is set`}
                    className={`flex-1 min-w-0 truncate text-left text-[11px] hover:underline ${
                      done ? 'text-gray-400 line-through' : 'text-gray-700 hover:text-indigo-700'
                    }`}
                  >
                    {clean(e.heading)}
                  </button>
                  {e.priority && (
                    <span className="text-[9px] text-gray-400 flex-shrink-0">#{e.priority}</span>
                  )}
                </div>
              )
            })}
            {entries.length > 40 && (
              <p className="text-[9px] text-gray-400 px-1">+{entries.length - 40} more</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
