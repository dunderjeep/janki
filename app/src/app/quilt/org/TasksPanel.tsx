'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Task = {
  heading: string
  todo: string | null
  priority: string | null
  scheduled: string | null
  deadline: string | null
  tags: string[]
  file: string
  pos: number
  /** The nearest linkable note, to open on the canvas. */
  node?: string | null
}

/** `<2026-09-08 Tue +1w>` → `Sep 8`, plus a mark when it repeats. */
function stamp(s: string | null): string | null {
  if (!s) return null
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return /[.+]{1,2}\d+[dwmy]/.test(s) ? `${label} ⟳` : label
}

/** The date a row is judged by: DEADLINE if it has one, else SCHEDULED. */
function due(t: Task): string | null {
  for (const s of [t.deadline, t.scheduled]) {
    const m = s && /(\d{4}-\d{2}-\d{2})/.exec(s)
    if (m) return m[1]
  }
  return null
}

/**
 * Everything outstanding across the agenda files.
 *
 * The agenda beneath this answers "what is due today"; a task captured without
 * a date is invisible to that question, and is exactly the kind that goes
 * missing. This is the list that catches them.
 */
export default function TasksPanel({
  onPeek,
}: {
  onPeek: (file: string, pos: number, node: string | null) => void
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // What the last tick actually did, against the row it was aimed at.
  const [note, setNote] = useState<{ key: string; text: string; bad?: boolean } | null>(null)
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<Task[] | null> => {
    try {
      const d = await fetch('/api/org/tasks').then(r => r.json())
      const list: Task[] = d.tasks ?? []
      setTasks(list)
      setError(d.available ? null : d.error)
      return list
    } catch {
      setError('Request failed')
      return null
    }
  }, [])

  // Re-read rather than assumed: the list can change in another tab or through the org mirror.
  useEffect(() => {
    reload()
    const timer = setInterval(reload, 20000)
    const onVisible = () => { if (!document.hidden) reload() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', reload)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reload)
    }
  }, [reload])

  /**
   * Tick the box, then say what happened.
   *
   * DONE does not finish a repeater: org reopens it and rolls SCHEDULED
   * forward, so the row comes back looking identical and the click reads as
   * dead. Clicking again just pushes the date another week out. The reply
   * carries the resulting state, so a repeater can say where it went - and a
   * refusal can say so instead of showing nothing at all.
   */
  const complete = useCallback(async (t: Task) => {
    const key = `${t.file}:${t.pos}`
    const row = `${t.file}:${t.heading}`
    setBusy(key)
    setNote(null)
    try {
      const res = await fetch('/api/org/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: t.file, pos: t.pos, state: 'DONE' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        setNote({ key: row, text: String(body.error ?? `Refused (${res.status})`), bad: true })
        return
      }
      const list = await reload()
      if (body.state && body.state !== 'DONE') {
        // Found by heading, not by pos: writing the stamp moves every entry
        // below it in the file.
        const again = list?.find(x => x.file === t.file && x.heading === t.heading)
        const when = again && (stamp(again.deadline) ?? stamp(again.scheduled))
        setNote({ key: row, text: when ? `next ${when}` : 'repeats' })
      }
    } catch {
      setNote({ key: row, text: 'Request failed', bad: true })
    } finally {
      setBusy(null)
    }
  }, [reload])

  /** Capture a plain, undated TODO — see /api/org/tasks and quilt/add-task. */
  const add = useCallback(async () => {
    const text = newText.trim()
    if (!text) { setAdding(false); return }
    setAddBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/org/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        setError(String(body.error ?? `Refused (${res.status})`))
        return
      }
      setTasks(body.tasks ?? [])
      setNewText('')
      setAdding(false)
    } catch {
      setError('Request failed')
    } finally {
      setAddBusy(false)
    }
  }, [newText])

  /** Delete the task and everything under it. One confirm, then it's gone. */
  const remove = useCallback(async (t: Task) => {
    if (!confirm(`Delete “${t.heading || '(untitled)'}”? This cannot be undone.`)) return
    const key = `${t.file}:${t.pos}`
    setDeleting(key)
    setError(null)
    try {
      const res = await fetch('/api/org/tasks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: t.file, pos: t.pos, heading: t.heading }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        setError(String(body.error ?? `Refused (${res.status})`))
        reload()
        return
      }
      setTasks(body.tasks ?? [])
    } catch {
      setError('Request failed')
    } finally {
      setDeleting(null)
    }
  }, [reload])

  /**
   * Soonest first, and the undated ahead of all of them.
   *
   * ISO dates sort correctly as strings, so no parsing is needed past the
   * stamp. A task with no date is the kind this list exists to catch, so it
   * stays at the top rather than being pushed below the fold. Sorting is
   * stable, so two rows sharing a date keep the order the files gave them.
   */
  const ordered = useMemo(() => {
    return [...(tasks ?? [])].sort((a, b) => {
      const da = due(a)
      const db = due(b)
      if (!da && !db) return 0
      if (!da) return -1
      if (!db) return 1
      return da < db ? -1 : da > db ? 1 : 0
    })
  }, [tasks])

  // Long enough to read, short enough that the date comes back on its own.
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(timer)
  }, [note])

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Tasks
        </span>
        <div className="flex items-center gap-1.5">
          {tasks && tasks.length > 0 && (
            <span className="text-[11px] font-semibold text-gray-500">{tasks.length}</span>
          )}
          <button
            onClick={() => setAdding(v => !v)}
            title="Add a task"
            className="w-4 h-4 rounded flex items-center justify-center leading-none
                       text-gray-400 hover:text-indigo-600 hover:bg-gray-100"
          >
            +
          </button>
        </div>
      </div>

      {adding && (
        <input
          autoFocus
          value={newText}
          disabled={addBusy}
          onChange={e => setNewText(e.target.value)}
          onBlur={() => { if (!newText.trim()) setAdding(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') { setNewText(''); setAdding(false) }
          }}
          placeholder="New task…"
          className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 mb-1
                     focus:outline-none focus:border-indigo-400 disabled:opacity-50"
        />
      )}

      {error && <p className="text-[10px] text-amber-600 leading-snug">{error}</p>}

      {tasks && tasks.length === 0 && !error && (
        <p className="text-[10px] text-gray-400 leading-snug">
          Nothing outstanding.
        </p>
      )}

      <div className="space-y-0.5 max-h-56 overflow-y-auto">
        {ordered.map(t => {
          const key = `${t.file}:${t.pos}`
          const when = stamp(t.deadline) ?? stamp(t.scheduled)
          const said = note?.key === `${t.file}:${t.heading}` ? note : null
          return (
            <div key={key} className="group flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50">
              <button
                onClick={() => complete(t)}
                disabled={busy === key}
                title="Mark DONE"
                className="flex-shrink-0 w-3 h-3 rounded-sm border border-gray-300
                           text-transparent hover:border-green-500 disabled:opacity-40
                           flex items-center justify-center text-[8px] font-bold"
              >
                ✓
              </button>
              <button
                onClick={() => onPeek(t.file, t.pos, t.node ?? null)}
                title={`${t.heading || '(untitled)'}\n${t.file.split('/').pop()} — click to open`}
                className="flex-1 min-w-0 truncate text-left text-[11px] text-gray-700
                           hover:text-indigo-700 hover:underline"
              >
                {/* A capture confirmed before anything was typed leaves an empty
                    heading. Saying so beats rendering a blank row. */}
                {t.heading || <span className="text-gray-400 italic">untitled</span>}
              </button>
              {said ? (
                <span
                  title={said.text}
                  className={`text-[9px] flex-shrink-0 max-w-[9rem] truncate ${
                    said.bad ? 'text-amber-600' : 'text-green-600'
                  }`}
                >
                  {said.text}
                </span>
              ) : (
                <>
                  {t.priority && (
                    <span className="text-[9px] text-gray-400 flex-shrink-0">#{t.priority}</span>
                  )}
                  {when && (
                    <span className={`text-[9px] flex-shrink-0 ${
                      t.deadline ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {when}
                    </span>
                  )}
                </>
              )}
              <button
                onClick={() => remove(t)}
                disabled={deleting === key}
                title="Delete this task"
                className="flex-shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center
                           text-[10px] leading-none text-gray-300 opacity-0 group-hover:opacity-100
                           hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-[9px] text-gray-400 mt-1 leading-snug">
        <kbd className="px-1 rounded bg-gray-100 text-gray-500">C-c q</kbd> adds a birthday,
        bill or repeating task — it asks which and writes the right shape.{' '}
        <kbd className="px-1 rounded bg-gray-100 text-gray-500">C-c c t</kbd> captures a plain
        one, <kbd className="px-1 rounded bg-gray-100 text-gray-500">C-c c l</kbd> keeps a link
        back to where you are.
      </p>
    </div>
  )
}
