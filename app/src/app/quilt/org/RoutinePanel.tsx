'use client'

import { useCallback, useEffect, useState } from 'react'
import NewDailyButton from '@/components/org/NewDailyButton'

type Item = { raw: string; key: string; label: string; done: boolean; line: number }
type Today = {
  date: string; file: string | null; items: Item[]; done: number; total: number
  todo: Item[]; todoDone: number; todoTotal: number
  /** Always true now: the notes are the current state. */
  live: boolean
}

type ItemHistory = {
  key: string; label: string
  days: { date: string; done: boolean }[]
  appeared: number; completed: number; streak: number; bestStreak: number
  current: boolean
}
type History = {
  from: string; to: string; days: number
  items: ItemHistory[]
  daily: { date: string; done: number; total: number }[]
}

/** Completion rate → the same warm-to-cool ramp the rings use. */
function rateColor(rate: number): string {
  if (rate >= 0.7) return '#16a34a'
  if (rate >= 0.45) return '#65a30d'
  if (rate >= 0.25) return '#d97706'
  return '#dc2626'
}

/**
 * Last N days for one item, newest on the right.
 *
 * A row of squares rather than a number: 43% says nothing about whether you did
 * it every other day for a year or every day for five months and then stopped,
 * and those are completely different facts about a practice.
 */
function Sparks({ days, n = 30 }: { days: { date: string; done: boolean }[]; n?: number }) {
  const recent = days.slice(0, n).reverse()
  return (
    <div className="flex gap-[1px]">
      {recent.map(d => (
        <span
          key={d.date}
          title={`${d.date} — ${d.done ? 'done' : 'missed'}`}
          className="w-[5px] h-[10px] rounded-[1px]"
          style={{ backgroundColor: d.done ? '#16a34a' : '#e5e7eb' }}
        />
      ))}
    </div>
  )
}

function CheckRow({
  item, busy, onToggle,
}: {
  item: Item
  busy: boolean
  onToggle: (i: Item) => void
}) {
  return (
    <button
      onClick={() => onToggle(item)}
      disabled={busy}
      className="w-full flex items-center gap-1.5 text-left px-1 py-0.5 rounded
                 hover:bg-gray-50 disabled:opacity-40"
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
  )
}

/**
 * Today's routine, and what has become of it over three and a half years.
 *
 * A tick edits today's daily note (see /api/org/routine/toggle), which also
 * keeps the heading's [n/m] cookie true.
 */
export default function RoutinePanel() {
  const [today, setToday] = useState<Today | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    fetch('/api/org/routine').then(r => r.json()).then(setToday).catch(() => {})
  }, [])

  /**
   * Re-read on a timer and on visibility: the daily can change elsewhere
   * (another tab, or the org mirror bringing in an edit), and a stale list
   * makes clicks look dead, since it asks for a state the note already holds.
   */
  useEffect(() => {
    reload()
    const timer = setInterval(reload, 15000)
    const onVisible = () => { if (!document.hidden) reload() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', reload)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reload)
    }
  }, [reload])

  useEffect(() => {
    if (!showHistory || history) return
    fetch('/api/org/routine/history').then(r => r.json()).then(setHistory).catch(() => {})
  }, [showHistory, history])

  const toggle = useCallback(async (item: Item) => {
    setBusy(item.key)
    setError(null)
    try {
      const res = await fetch('/api/org/routine/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The state we want, not "toggle" — see the route for why.
        body: JSON.stringify({ line: item.line, raw: item.raw, want: item.done ? 'open' : 'done' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'toggle failed')
        reload() // most failures mean the page is behind the file
        return
      }
      // The response carries the re-read file, so the panel always shows what
      // is actually on disk rather than what we hoped we wrote.
      setToday(t => (t ? { ...t, ...data } : t))
      setHistory(null)
    } finally {
      setBusy(null)
    }
  }, [reload])

  if (!today) return null

  if (!today.file) {
    return (
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Routine</div>
        <p className="text-[11px] text-gray-400 leading-snug mb-1.5">
          No daily for {today.date} yet.
        </p>
        <NewDailyButton onDone={reload}
          className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50" />
      </div>
    )
  }

  const pct = today.total > 0 ? today.done / today.total : 0

  return (
    <div className="border-b border-gray-100">
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Routine
          </span>
          <span className="text-[11px] font-semibold" style={{ color: rateColor(pct) }}>
            {today.done}/{today.total}
          </span>
        </div>

        <div className="h-1 rounded-full bg-gray-100 overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct * 100}%`, backgroundColor: rateColor(pct) }} />
        </div>

        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {today.items.map(item => (
            <CheckRow key={`${item.line}:${item.key}`} item={item}
              busy={busy === item.key} onToggle={toggle} />
          ))}
        </div>

        {error && <p className="text-[10px] text-red-500 mt-1 leading-snug">{error}</p>}

        <button onClick={() => setShowHistory(v => !v)}
          className="mt-1 text-[10px] text-gray-400 hover:text-gray-700">
          {showHistory ? 'Hide history' : 'History'}
        </button>
      </div>

      {/* Everything else checked into today's daily. Same file, same write path
          — the only difference is that these are not standing practice, so they
          get no history and no streak. */}
      <div className="px-3 py-2 border-t border-gray-100">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            To do today
          </span>
          {today.todoTotal > 0 && (
            <span className="text-[11px] font-semibold"
              style={{ color: rateColor(today.todoDone / today.todoTotal) }}>
              {today.todoDone}/{today.todoTotal}
            </span>
          )}
        </div>

        {today.todoTotal === 0 ? (
          <p className="text-[10px] text-gray-400 leading-snug">
            Nothing beyond the routine. Add a <code>- [ ]</code> to today&apos;s daily
            and it shows here.
          </p>
        ) : (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {today.todo.map(item => (
              <CheckRow key={`${item.line}:${item.key}`} item={item}
                busy={busy === item.key} onToggle={toggle} />
            ))}
          </div>
        )}
      </div>

      {showHistory && (
        <div className="px-3 pb-2 border-t border-gray-100 pt-2">
          {!history ? (
            <p className="text-[10px] text-gray-400">Reading the dailies…</p>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 mb-2 leading-snug">
                {history.days} days with a routine, {history.from} → {history.to}.
              </p>
              <div className="space-y-1.5">
                {history.items.map(i => {
                  const rate = i.appeared > 0 ? i.completed / i.appeared : 0
                  return (
                    <div key={i.key} className={i.current ? '' : 'opacity-60'}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-gray-700 truncate flex-1">
                          {i.label}
                          {!i.current && (
                            <span className="text-[9px] text-gray-400 ml-1">retired</span>
                          )}
                        </span>
                        <span className="text-[10px] font-medium flex-shrink-0"
                          style={{ color: rateColor(rate) }}>
                          {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Sparks days={i.days} />
                        <span className="text-[9px] text-gray-400 flex-shrink-0"
                          title={`${i.completed} of ${i.appeared} days · best run ${i.bestStreak}`}>
                          {i.streak > 0 ? `${i.streak}d` : `best ${i.bestStreak}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
