'use client'

/**
 * Next's GTD parts: capture, the inbox and its processing, the tools on a task
 * (snooze, now, someday, waiting, contexts, time, energy, files), the filters,
 * the weekly review and the someday list. The rules are in lib/chains/tree.ts
 * and lib/chains/gtd.ts; this is only how they look.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChainNode, NextAction, AttachmentInfo, Upcoming } from '@/lib/chains/tree'
import type { Trashed } from '@/lib/chains/notesChains'
import { effortMinutes } from '@/lib/chains/tree'
import type { InboxItem, InboxView, ListedTask, Review } from '@/lib/chains/gtd'
import { api, chainOp, message } from './NextList'
import { TaskDocs } from './docs'

// ── Days ──────────────────────────────────────────────────────────────────────

const iso = (d: Date) => d.toLocaleDateString('sv-SE')
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
/** The next given weekday (0 Sunday … 6 Saturday), never today. */
const nextWeekday = (day: number) => { const d = new Date(); d.setDate(d.getDate() + (((day - d.getDay() + 7) % 7) || 7)); return iso(d) }
const MORNING = '08:00'
const pad = (n: number) => String(n).padStart(2, '0')
/** Time slots for a chosen day, as Gmail offers them. */
const SLOTS: [string, string][] = [['Morning', MORNING], ['Afternoon', '13:00'], ['Evening', '18:00']]

/**
 * The quick snoozes, worked out now: the ones later today come and go with
 * the clock. Each is "YYYY-MM-DD HH:MM", or a day alone for a month away.
 */
function quickSnoozes(at = new Date()): [string, string][] {
  const hour = at.getHours()
  const inAnHour = new Date(at.getTime() + 60 * 60_000)
  // Rounded up to the next quarter hour, so it reads as a time you'd pick.
  inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 15) * 15, 0, 0)
  const today = iso(at)
  return [
    ...(hour < 22 && iso(inAnHour) === today ? [['In an hour', `${today} ${pad(inAnHour.getHours())}:${pad(inAnHour.getMinutes())}`] as [string, string]] : []),
    ...(hour < 17 ? [['Later today', `${today} 18:00`] as [string, string]] : hour < 20 ? [['Tonight', `${today} 21:00`] as [string, string]] : []),
    ['Tomorrow', `${plus(1)} ${MORNING}`],
    ['This weekend', `${nextWeekday(6)} ${MORNING}`],
    ['Next week', `${nextWeekday(1)} ${MORNING}`],
    ['In a month', plus(30)],
  ]
}
const pretty = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

// ── Small parts ───────────────────────────────────────────────────────────────

const btn = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-sky-500 disabled:opacity-50'
const primary = 'rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50'
const input = 'min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500'

export const DEFAULT_CONTEXTS = ['@home', '@computer', '@phone', '@errands', '@work']
const EFFORTS: [string, string][] = [['', 'time?'], ['0:05', '5 min'], ['0:15', '15 min'], ['0:30', '30 min'], ['1:00', '1 h'], ['2:00', '2 h'], ['4:00', 'half a day']]
const effortLabel = (e: string | null) => EFFORTS.find(([v]) => v === e)?.[1] ?? (e ? `${e}` : null)

/** Snooze buttons: tomorrow, the weekend, next week, a month, or a day you pick. */
/** "Tue 8:00", "Sat 16 Nov", "today 18:00": when a snooze ends, short. */
const whenLabel = (when: string) => {
  const day = when.slice(0, 10)
  const time = when.slice(11)
  const d = day === iso(new Date()) ? 'today' : day === plus(1) ? 'tomorrow' : pretty(day)
  return time ? `${d} ${time}` : d
}

export function SnoozeMenu({ onSnooze, busy }: { onSnooze: (day: string) => void; busy?: boolean }) {
  const [day, setDay] = useState('')
  const [time, setTime] = useState('')
  // Worked out when the menu opens; "In an hour" would drift if kept.
  const [quick] = useState(() => quickSnoozes())
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {quick.map(([label, when]) => (
          <button key={label} className={btn} disabled={busy} onClick={() => onSnooze(when)} title={`Until ${whenLabel(when)}`}>
            {label} <span className="text-gray-400">· {when.length > 10 ? (when.slice(0, 10) === iso(new Date()) ? when.slice(11) : `${new Date(`${when.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} ${when.slice(11)}`) : pretty(when)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" aria-label="Pick a day" className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs" value={day} min={iso(new Date())} onChange={(e) => setDay(e.target.value)} />
        <input type="time" aria-label="Time (optional)" className="rounded-lg border border-gray-200 px-2 py-0.5 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
        {day && SLOTS.map(([label, t]) => (
          <button key={label} className={`${btn} ${time === t ? 'border-sky-500 bg-sky-50' : ''}`} onClick={() => setTime(time === t ? '' : t)}>{label}</button>
        ))}
        {(day || time) && (
          <button className={btn} disabled={busy || (!day && !time)} onClick={() => {
            const d = day || iso(new Date())
            onSnooze(time ? `${d} ${time}` : d)
          }}>Until {whenLabel(time ? `${day || iso(new Date())} ${time}` : day)}</button>
        )}
      </div>
    </div>
  )
}

/** Context chips you can toggle, plus a box for a new one. */
function ContextPicker({ value, known, onChange }: { value: string[]; known: string[]; onChange: (next: string[]) => void }) {
  const [custom, setCustom] = useState('')
  const all = [...new Set([...known, ...value])]
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  return (
    <div className="flex flex-wrap items-center gap-1">
      {all.map((c) => (
        <button key={c} onClick={() => toggle(c)}
          className={`rounded-full border px-2 py-0.5 text-xs ${value.includes(c) ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
          {c}
        </button>
      ))}
      <form onSubmit={(e) => {
        e.preventDefault()
        const c = custom.trim().replace(/^@?/, '@').replace(/\s+/g, '_')
        if (c.length > 1 && !value.includes(c)) onChange([...value, c])
        setCustom('')
      }}>
        <input className="w-24 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs" placeholder="+ @context" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </form>
    </div>
  )
}

/** The files on a task: open, remove, add. */
function Attachments({ place, id, list, onChanged }: { place: string; id: string; list: AttachmentInfo[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.set('place', place)
      form.set('id', id)
      form.set('file', file)
      const res = await fetch('/api/gtd/attach', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
      onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1">
      {list.map((a) => (
        <div key={a.cid} className="flex items-center gap-2 text-xs">
          <a className="truncate text-sky-800 hover:underline" href={`/api/gtd/blob/${a.cid}?name=${encodeURIComponent(a.name)}`} target="_blank" rel="noreferrer">
            📎 {a.name}
          </a>
          <span className="shrink-0 text-gray-400">{a.size < 1024 * 1024 ? `${Math.ceil(a.size / 1024)} KB` : `${(a.size / 1024 / 1024).toFixed(1)} MB`}</span>
          <button className="shrink-0 text-gray-400 hover:text-red-700" title="Remove from this task"
            onClick={async () => { await api('/api/gtd/attach', 'DELETE', { place, id, cid: a.cid }); onChanged() }}>×</button>
        </div>
      ))}
      <label className={`${btn} inline-block cursor-pointer`}>
        {busy ? 'Uploading…' : '+ Attach a file'}
        <input type="file" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/**
 * Everything you can say about a task beyond its name: snooze it, put it in
 * the two-minute queue, move it to someday, say who it waits for, and the
 * contexts, time, energy and files it has.
 */
export function TaskTools({ a, knownContexts, onChanged, onFlash }: {
  a: NextAction
  knownContexts: string[]
  onChanged: () => Promise<void> | void
  onFlash: (text: string, undo?: () => Promise<void>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [who, setWho] = useState('')
  const id = a.id!
  const set = (field: string, value: string) => chainOp(a.domain, { op: 'set', id, field, value })
  const run = async (work: () => Promise<unknown>, said?: string, undo?: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      if (said) onFlash(said, undo && (async () => { await undo(); await onChanged() }))
      await onChanged()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  if (a.source !== 'chain' || !a.id || a.needsStep) return null
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-2.5">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Schedule it for later</p>
        <SnoozeMenu busy={busy} onSnooze={(day) => run(
          () => api('/api/gtd/snooze', 'POST', { place: a.domain, id, until: day }),
          `Scheduled for ${pretty(day)}${day.length > 10 ? ` at ${day.slice(11)}` : ''}: ${a.title}`,
          () => api('/api/gtd/snooze', 'POST', { place: a.domain, id, until: null }).then(() => undefined),
        )} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={btn} disabled={busy} onClick={() => run(() => set('now', a.now ? 'nil' : 't'), a.now ? `Out of Now: ${a.title}` : `Into Now: ${a.title}`)}>
          {a.now ? 'Not a two-minute job' : 'Two minutes: do it now'}
        </button>
        <button className={btn} disabled={busy} onClick={() => run(() => set('todo', 'SOMEDAY'), `Someday/maybe: ${a.title}`, () => set('todo', 'TODO').then(() => undefined))}>
          Someday/maybe
        </button>
        <form className="flex gap-1" onSubmit={(e) => {
          e.preventDefault()
          if (!who.trim()) return
          void run(async () => { await set('WAITING_ON', who.trim()); await set('todo', 'WAIT') }, `Waiting for ${who.trim()}: ${a.title}`)
        }}>
          <input className="w-32 rounded-lg border border-gray-200 px-2 py-1 text-xs" placeholder="Waiting for whom?" value={who} onChange={(e) => setWho(e.target.value)} />
          <button className={btn} disabled={busy || !who.trim()}>Wait</button>
        </form>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Where you can do it</p>
        <ContextPicker value={a.contexts} known={knownContexts} onChange={(next) => run(() => set('contexts', next.join(' ')))} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={a.effort ?? ''} disabled={busy}
          onChange={(e) => run(() => set('EFFORT', e.target.value))}>
          {EFFORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={a.energy ?? ''} disabled={busy}
          onChange={(e) => run(() => set('ENERGY', e.target.value))}>
          <option value="">energy?</option>
          <option value="low">low energy</option>
          <option value="high">high energy</option>
        </select>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Files and docs</p>
        <Attachments place={a.domain} id={id} list={a.attachments} onChanged={() => void onChanged()} />
        <div className="mt-1.5"><TaskDocs place={a.domain} project={a.frontId ?? id} task={id} /></div>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** The small marks on a task: contexts, time, energy, files. */
export function GtdBadges({ a }: { a: NextAction }) {
  const time = effortLabel(a.effort)
  if (!a.contexts.length && !time && !a.energy && !a.attachments.length) return null
  return (
    <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
      {a.contexts.map((c) => <span key={c} className="rounded-full bg-sky-50 px-1.5 text-sky-900">{c}</span>)}
      {time && <span>⏱ {time}</span>}
      {a.energy && <span>{a.energy === 'low' ? '🔋 low' : '⚡ high'}</span>}
      {a.attachments.length > 0 && <span>📎 {a.attachments.length}</span>}
    </p>
  )
}

// ── Filters ───────────────────────────────────────────────────────────────────

export type Filter = { context: string | null; minutes: number | null; energy: 'low' | 'high' | null }
export const NO_FILTER: Filter = { context: null, minutes: null, energy: null }

/**
 * What fits right now. A task with no time or energy set stays in: not knowing
 * is not a reason to hide it.
 */
export function applyFilter(items: NextAction[], f: Filter): NextAction[] {
  return items.filter((a) => {
    if (f.context && !a.contexts.includes(f.context)) return false
    const m = effortMinutes(a.effort)
    if (f.minutes !== null && m !== null && m > f.minutes) return false
    if (f.energy === 'low' && a.energy === 'high') return false
    return true
  })
}

export function FilterBar({ items, filter, onChange }: { items: NextAction[]; filter: Filter; onChange: (f: Filter) => void }) {
  const contexts = useMemo(() => [...new Set(items.flatMap((a) => a.contexts))].sort(), [items])
  const chip = (on: boolean) => `rounded-full border px-2 py-0.5 text-xs ${on ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-500">I&apos;m</span>
      {contexts.map((c) => (
        <button key={c} className={chip(filter.context === c)} onClick={() => onChange({ ...filter, context: filter.context === c ? null : c })}>{c}</button>
      ))}
      <select className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs" value={filter.minutes ?? ''}
        onChange={(e) => onChange({ ...filter, minutes: e.target.value ? Number(e.target.value) : null })}>
        <option value="">with any time</option>
        <option value="5">with 5 min</option>
        <option value="15">with 15 min</option>
        <option value="30">with 30 min</option>
        <option value="60">with an hour</option>
      </select>
      <select className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs" value={filter.energy ?? ''}
        onChange={(e) => onChange({ ...filter, energy: (e.target.value || null) as Filter['energy'] })}>
        <option value="">any energy</option>
        <option value="low">low on energy</option>
        <option value="high">full of energy</option>
      </select>
      {(filter.context || filter.minutes !== null || filter.energy) && (
        <button className="text-xs text-sky-800 hover:underline" onClick={() => onChange(NO_FILTER)}>show all</button>
      )}
    </div>
  )
}

// ── Capture and the inbox ─────────────────────────────────────────────────────

/** Gets a thing out of your head and into the inbox. */
export function CaptureBox({ onCaptured, autoFocus, big }: { onCaptured?: (title: string) => void; autoFocus?: boolean; big?: boolean }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await api('/api/gtd/inbox', 'POST', { title: title.trim(), detail })
      onCaptured?.(title.trim())
      setTitle('')
      setDetail('')
      setMore(false)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="space-y-2">
      <div className="flex gap-2">
        <input autoFocus={autoFocus} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={big ? "What's on your mind?" : "What's on your mind? It goes to the inbox"}
          className={`${input} flex-1 ${big ? 'py-3 text-base' : ''}`} />
        <button disabled={busy || !title.trim()} className={`${primary} ${big ? 'px-5 text-base' : ''}`}>{busy ? '…' : 'Capture'}</button>
      </div>
      {more
        ? <textarea className={`${input} w-full`} rows={3} placeholder="Any detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
        : <button type="button" className="text-xs text-gray-500 hover:text-sky-800" onClick={() => setMore(true)}>+ add detail</button>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  )
}

export function useInbox() {
  const [view, setView] = useState<InboxView | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setView(await api<InboxView>('/api/gtd/inbox'))
      setError('')
    } catch (err) {
      setError(message(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { view, error, reload }
}

type Place = { value: string; label: string; place: string; parent: string | null }

/** Lists and projects a thing can go into: the top of each list, then every open project in it. */
export function placesIn(outline: { domain: { key: string; title: string }; fronts: ChainNode[] }[]): Place[] {
  const out: Place[] = []
  for (const { domain, fronts } of outline) {
    out.push({ value: `${domain.key}:`, label: `${domain.title} (on its own)`, place: domain.key, parent: null })
    const walk = (n: ChainNode, path: string[]) => {
      if (n.done || n.someday) return
      if (path.length === 0 || n.children.length) out.push({ value: `${domain.key}:${n.id}`, label: `${domain.title} › ${[...path, n.title].join(' › ')}`, place: domain.key, parent: n.id })
      n.children.forEach((c) => walk(c, [...path, n.title]))
    }
    fronts.forEach((f) => walk(f, []))
  }
  return out
}

/**
 * One inbox item at a time, and the GTD question about it. Each answer moves
 * it out of the inbox, so working down this card is how the inbox gets to zero.
 */
function ProcessCard({ item, places, knownContexts, onDone, onRenamed }: {
  item: InboxItem
  places: Place[]
  knownContexts: string[]
  onDone: (said: string) => void
  onRenamed?: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<null | 'next' | 'project' | 'waiting' | 'snooze'>(null)
  const [target, setTarget] = useState(places[0]?.value ?? 'life:')
  const [contexts, setContexts] = useState<string[]>([])
  const [effort, setEffort] = useState('')
  const [energy, setEnergy] = useState('')
  const [first, setFirst] = useState('')
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setMode(null); setContexts([]); setEffort(''); setEnergy(''); setFirst(''); setWho(''); setError('') }, [item.id])
  const where = places.find((p) => p.value === target) ?? places[0]
  const decide = async (decision: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const { said } = await api<{ said: string }>('/api/gtd/process', 'POST', { id: item.id, decision })
      onDone(said)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }
  const PlaceSelect = ({ projectsToo = true }: { projectsToo?: boolean }) => (
    <select className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
      {places.filter((p) => projectsToo || p.parent === null).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  )
  return (
    <section className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-800">What is it, and what&apos;s the next action?</p>
      <p className="mt-1 text-lg font-semibold text-gray-900 break-words">
        <EditableTitle place="inbox" id={item.id} title={item.title} onSaved={onRenamed} />
      </p>
      {item.created && <p className="text-xs text-gray-500">captured {item.created.replace(/[[\]]/g, '')}</p>}
      {item.attachments.length > 0 && <p className="text-xs text-gray-500">📎 {item.attachments.map((a) => a.name).join(', ')}</p>}

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <button className={btn} disabled={busy} onClick={() => decide({ kind: 'now' })} title="Under two minutes: do it now">⚡ Do it now</button>
        <button className={btn} disabled={busy} onClick={() => setMode('next')}>➜ Next action…</button>
        <button className={btn} disabled={busy} onClick={() => setMode('project')}>▤ Project…</button>
        <button className={btn} disabled={busy} onClick={() => setMode('waiting')}>⏳ Waiting for…</button>
        <button className={btn} disabled={busy} onClick={() => setMode('snooze')}>⏰ Snooze…</button>
        <button className={btn} disabled={busy} onClick={() => decide({ kind: 'someday', place: where.place })}>☁ Someday</button>
        <button className={btn} disabled={busy} onClick={() => decide({ kind: 'note' })} title="Not a task: keep it as a note">🗒 Keep as note</button>
        <button className={`${btn} hover:border-red-400`} disabled={busy} onClick={() => decide({ kind: 'trash' })}>🗑 Trash</button>
      </div>

      {mode === 'next' && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2"><span className="pt-1.5 text-xs text-gray-500">into</span><PlaceSelect /></div>
          <ContextPicker value={contexts} known={knownContexts} onChange={setContexts} />
          <div className="flex flex-wrap gap-2">
            <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={effort} onChange={(e) => setEffort(e.target.value)}>
              {EFFORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={energy} onChange={(e) => setEnergy(e.target.value)}>
              <option value="">energy?</option><option value="low">low energy</option><option value="high">high energy</option>
            </select>
            <button className={primary} disabled={busy} onClick={() => decide({ kind: 'next', place: where.place, parent: where.parent, contexts: contexts.join(' '), effort, energy })}>Make it a next action</button>
          </div>
        </div>
      )}
      {mode === 'project' && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void decide({ kind: 'project', place: where.place, firstStep: first }) }}>
          <div className="flex gap-2"><span className="pt-1.5 text-xs text-gray-500">in</span><PlaceSelect projectsToo={false} /></div>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} placeholder="Its first physical step (optional)" value={first} onChange={(e) => setFirst(e.target.value)} />
            <button className={primary} disabled={busy}>Make it a project</button>
          </div>
        </form>
      )}
      {mode === 'waiting' && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void decide({ kind: 'waiting', place: where.place, parent: where.parent, who }) }}>
          <div className="flex gap-2"><span className="pt-1.5 text-xs text-gray-500">in</span><PlaceSelect /></div>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} placeholder="Waiting for whom, or what?" value={who} onChange={(e) => setWho(e.target.value)} />
            <button className={primary} disabled={busy || !who.trim()}>Wait for it</button>
          </div>
        </form>
      )}
      {mode === 'snooze' && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-gray-500">Back in the inbox on…</p>
          <SnoozeMenu busy={busy} onSnooze={(until) => decide({ kind: 'snooze', until })} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  )
}

export function InboxTab({ inbox, places, knownContexts, onChanged }: {
  inbox: ReturnType<typeof useInbox>
  places: Place[]
  knownContexts: string[]
  onChanged: () => Promise<void>
}) {
  const [said, setSaid] = useState('')
  const { view, error, reload } = inbox
  const items = view?.items ?? []
  return (
    <div className="space-y-4">
      <CaptureBox onCaptured={() => void reload()} />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {said && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900" role="status">{said}</p>}
      {view && items.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">Inbox zero. Nothing left to decide.</p>
      )}
      {items[0] && (
        <ProcessCard item={items[0]} places={places} knownContexts={knownContexts} onRenamed={() => void reload()} onDone={async (s) => {
          setSaid(`${items[0].title}: ${s}`)
          await Promise.all([reload(), onChanged()])
        }} />
      )}
      {items.length > 1 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-gray-700">Still to process <span className="text-gray-400">({items.length - 1})</span></h3>
          <ul className="space-y-1">
            {items.slice(1).map((i) => (
              <li key={i.id} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 break-words">
                <EditableTitle place="inbox" id={i.id} title={i.title} onSaved={() => void reload()} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {(view?.snoozed.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-gray-700">Snoozed <span className="font-normal text-gray-400">comes back to the inbox on its day</span></h3>
          <ul className="space-y-1">
            {view!.snoozed.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm">
                <span className="min-w-0 break-words text-gray-700">{i.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                  {pretty(i.until!)}
                  <button className="text-sky-800 hover:underline" onClick={async () => { await api('/api/gtd/snooze', 'POST', { place: 'inbox', id: i.id, until: null }); await reload() }}>wake</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── Review and someday ────────────────────────────────────────────────────────

function TaskLines({ list, empty, action }: { list: ListedTask[]; empty: string; action?: (t: ListedTask) => React.ReactNode }) {
  if (!list.length) return <p className="text-sm text-gray-400">{empty}</p>
  return (
    <ul className="space-y-1">
      {list.map((t) => (
        <li key={`${t.place}:${t.id}`} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
          <div className="min-w-0">
            <p className="text-sm text-gray-800 break-words">{t.title}</p>
            <p className="text-xs text-gray-500">{[t.placeTitle, ...t.path].join(' › ')}{t.who ? ` · waiting for ${t.who}` : ''}{t.date ? ` · ${pretty(t.date)}` : ''}</p>
          </div>
          {action?.(t)}
        </li>
      ))}
    </ul>
  )
}

/** Someday/maybe: what you might do one day, and a way to commit to one. */
export function SomedayTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [list, setList] = useState<ListedTask[] | null>(null)
  const reload = useCallback(async () => setList((await api<{ items: ListedTask[] }>('/api/gtd/someday')).items), [])
  useEffect(() => { void reload() }, [reload])
  if (!list) return <p className="text-sm text-gray-400">Loading…</p>
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Not committed to, not forgotten. Look through it in the weekly review; make one a task when its time comes.</p>
      <TaskLines list={list} empty="Nothing on someday/maybe." action={(t) => (
        <span className="flex shrink-0 gap-2 text-xs">
          <button className="text-sky-800 hover:underline" onClick={async () => { await chainOp(t.place, { op: 'set', id: t.id, field: 'todo', value: 'TODO' }); await Promise.all([reload(), onChanged()]) }}>Do it</button>
          <button className="text-red-700 hover:underline" onClick={async () => {
            if (!confirm(`Delete "${t.title}"?`)) return
            await chainOp(t.place, { op: 'delete', id: t.id })
            await reload()
          }}>Drop</button>
        </span>
      )} />
    </div>
  )
}

/**
 * The weekly review, as a walk: get the inbox to zero, give every stuck
 * project a next action, chase what you are waiting for, look ahead at what
 * comes back, and through someday. Then say it is done.
 */
export function ReviewTab({ stuck, inboxCount, goInbox, onChanged }: {
  stuck: NextAction[]
  inboxCount: number
  goInbox: () => void
  onChanged: () => Promise<void>
}) {
  const [r, setR] = useState<Review | null>(null)
  const reload = useCallback(async () => setR(await api<Review>('/api/gtd/review')), [])
  useEffect(() => { void reload() }, [reload])
  if (!r) return <p className="text-sm text-gray-400">Loading…</p>
  const step = (n: number, title: string, ok: boolean) => (
    <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-800">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${ok ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{ok ? '✓' : n}</span>
      {title}
    </h3>
  )
  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">{r.lastReview ? `Last reviewed ${pretty(r.lastReview)}.` : 'Not reviewed yet.'} Once a week, walk down this page.</p>
      <section>
        {step(1, 'Empty the inbox', inboxCount === 0)}
        {inboxCount === 0
          ? <p className="text-sm text-gray-500">Inbox zero.</p>
          : <button className={btn} onClick={goInbox}>Process {inboxCount} {inboxCount === 1 ? 'item' : 'items'} →</button>}
      </section>
      <section>
        {step(2, 'Every project has a next action', stuck.length === 0)}
        {stuck.length === 0
          ? <p className="text-sm text-gray-500">None stuck.</p>
          : <ul className="space-y-1">{stuck.map((a) => <li key={a.key} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-sm text-amber-950">{a.title} <span className="text-xs text-amber-800">({a.domainTitle}) · answer it in Do</span></li>)}</ul>}
      </section>
      <section>{step(3, 'Chase what you are waiting for', false)}<TaskLines list={r.waiting} empty="Waiting on no one." /></section>
      <section>{step(4, 'Look at what comes back in the next two weeks', false)}<TaskLines list={r.comingBack} empty="Nothing snoozed until then." /></section>
      <section>{step(5, 'Look through someday/maybe', false)}<TaskLines list={r.someday} empty="Nothing on someday/maybe." /></section>
      <section>
        <h3 className="mb-1.5 text-sm font-semibold text-gray-800">Done this week <span className="font-normal text-gray-400">({r.done.length})</span></h3>
        <TaskLines list={r.done} empty="Nothing ticked off in the last seven days." />
      </section>
      <button className={primary} onClick={async () => { await api('/api/gtd/review', 'POST', {}); await Promise.all([reload(), onChanged()]) }}>
        Review done for this week
      </button>
    </div>
  )
}

// ── Calendar and coming up ────────────────────────────────────────────────────

/** What is dragged from a task list onto the calendar. */
export const TASK_DRAG = 'application/x-janki-task'
export type DraggedTask = { domain: string; id: string; title: string }

export function dragTask(e: React.DragEvent, t: DraggedTask) {
  e.dataTransfer.setData(TASK_DRAG, JSON.stringify(t))
  e.dataTransfer.setData('text/plain', t.title)
  e.dataTransfer.effectAllowed = 'move'
}

function dropped(e: React.DragEvent): DraggedTask | null {
  try {
    const t = JSON.parse(e.dataTransfer.getData(TASK_DRAG)) as DraggedTask
    return t && typeof t.id === 'string' && typeof t.domain === 'string' ? t : null
  } catch {
    return null
  }
}

const todayIso = () => iso(new Date())
const dayLabel = (day: string) => {
  if (day === todayIso()) return 'Today'
  if (day === plus(1)) return 'Tomorrow'
  return pretty(day)
}

/**
 * A month to plan on, and everything dated that is not due yet under it,
 * soonest first. Drop a task from the list (or a chip from another day) on a
 * day to schedule it there; a time can be given, or left out for all day.
 */
export function CalendarPlanner({ upcoming, onChanged, onFlash }: {
  upcoming: Upcoming[]
  onChanged: () => Promise<void>
  onFlash: (text: string, undo?: () => Promise<void>) => void
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [over, setOver] = useState<string | null>(null)
  const [pending, setPending] = useState<{ task: DraggedTask; day: string } | null>(null)
  const [time, setTime] = useState('')
  const [error, setError] = useState('')
  const byDay = useMemo(() => {
    const m = new Map<string, Upcoming[]>()
    for (const u of upcoming) m.set(u.date, [...(m.get(u.date) ?? []), u])
    return m
  }, [upcoming])
  const grid = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - ((month.getDay() + 6) % 7)) // Monday first
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])

  const schedule = async (task: { domain: string; id: string; title: string }, when: string | null, said: string) => {
    setError('')
    try {
      await api('/api/gtd/snooze', 'POST', { place: task.domain, id: task.id, until: when })
      onFlash(said)
      await onChanged()
    } catch (err) {
      setError(message(err))
    }
  }

  const drop = (e: React.DragEvent, day: string) => {
    e.preventDefault()
    setOver(null)
    const t = dropped(e)
    if (!t) return
    setTime('')
    setPending({ task: t, day })
  }

  const today = todayIso()
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <button className="px-2 text-gray-500 hover:text-gray-900" aria-label="Previous month"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
          <span className="text-sm font-medium text-gray-800">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button className="px-2 text-gray-500 hover:text-gray-900" aria-label="Next month"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="grid grid-cols-7 gap-px text-center text-[10px] text-gray-400">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px rounded bg-gray-100">
          {grid.map((d) => {
            const day = iso(d)
            const items = byDay.get(day) ?? []
            const inMonth = d.getMonth() === month.getMonth()
            const past = day < today
            return (
              <div key={day}
                onDragOver={(e) => { if (!past) { e.preventDefault(); setOver(day) } }}
                onDragLeave={() => setOver((o) => (o === day ? null : o))}
                onDrop={(e) => !past && drop(e, day)}
                className={`min-h-[3.25rem] bg-white p-0.5 text-left ${inMonth ? '' : 'opacity-40'} ${over === day ? 'ring-2 ring-inset ring-sky-500' : ''} ${past ? 'bg-gray-50' : ''}`}>
                <div className={`text-[10px] ${day === today ? 'inline-block rounded-full bg-sky-700 px-1 font-semibold text-white' : 'text-gray-500'}`}>{d.getDate()}</div>
                {items.slice(0, 2).map((u) => (
                  <div key={u.key} draggable={u.source === 'chain' && Boolean(u.id)}
                    onDragStart={(e) => u.id && dragTask(e, { domain: u.domain, id: u.id, title: u.title })}
                    title={`${u.title}${u.time ? ` at ${u.time}` : ''}${u.kind === 'deadline' ? ' (deadline)' : ''}`}
                    className={`truncate rounded px-0.5 text-[9px] leading-tight ${u.kind === 'deadline' ? 'bg-red-50 text-red-800' : 'bg-sky-50 text-sky-900'} ${u.id ? 'cursor-grab' : ''}`}>
                    {u.time ? `${u.time} ` : ''}{u.title}
                  </div>
                ))}
                {items.length > 2 && <div className="text-[9px] text-gray-400">+{items.length - 2}</div>}
              </div>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">Drag a task onto a day to schedule it. It leaves &ldquo;can do now&rdquo; until then.</p>
        {pending && (
          <form className="mt-2 space-y-1.5 rounded-lg border border-sky-200 bg-sky-50 p-2" onSubmit={async (e) => {
            e.preventDefault()
            const { task, day } = pending
            setPending(null)
            await schedule(task, time ? `${day} ${time}` : day, `Scheduled for ${dayLabel(day)}${time ? ` at ${time}` : ''}: ${task.title}`)
          }}>
            <p className="text-xs text-gray-800 break-words">Schedule <b>{pending.task.title}</b> for {dayLabel(pending.day)}</p>
            <div className="flex items-center gap-2">
              <input type="time" className="rounded border border-gray-200 px-1.5 py-0.5 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
              <span className="text-[11px] text-gray-500">{time ? '' : 'all day'}</span>
              <button className={primary}>Schedule</button>
              <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </form>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="mb-1.5 text-sm font-medium text-gray-700">Coming up <span className="text-gray-400">({upcoming.length})</span></h2>
        {upcoming.length === 0 && <p className="text-sm text-gray-400">Nothing dated ahead.</p>}
        <div className="space-y-2">
          {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => (
            <div key={day}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{dayLabel(day)}</p>
              <ul className="space-y-1">
                {items.map((u) => (
                  <li key={u.key} draggable={u.source === 'chain' && Boolean(u.id)}
                    onDragStart={(e) => u.id && dragTask(e, { domain: u.domain, id: u.id, title: u.title })}
                    className={`rounded-lg border px-2.5 py-1.5 ${u.kind === 'deadline' ? 'border-red-100 bg-red-50/40' : 'border-gray-200 bg-white'} ${u.id ? 'cursor-grab' : ''}`}>
                    <p className="text-sm text-gray-800 break-words">
                      <span className="mr-1" title={u.kind === 'deadline' ? 'Deadline' : 'Scheduled'}>{u.kind === 'deadline' ? '⚠' : '⏰'}</span>
                      {u.time && <span className="mr-1 text-gray-500">{u.time}</span>}
                      {u.id ? <EditableTitle place={u.domain} id={u.id} title={u.title} onSaved={onChanged} /> : u.title}
                    </p>
                    <p className="text-[11px] text-gray-500">{[u.domainTitle, ...u.path].join(' › ')}{u.kind === 'scheduled' && u.deadline ? ` · due ${pretty(u.deadline)}` : ''}</p>
                    {u.id && (
                      <span className="mt-0.5 flex gap-3 text-[11px]">
                        <button className="text-sky-800 hover:underline" onClick={() => schedule({ domain: u.domain, id: u.id!, title: u.title }, today, `For today: ${u.title}`)}>Do today</button>
                        {u.kind === 'scheduled' && (
                          <button className="text-gray-500 hover:underline" onClick={() => schedule({ domain: u.domain, id: u.id!, title: u.title }, null, `Unscheduled: ${u.title}`)}>Unschedule</button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Deleted headings, newest first: put one back, or delete it for good. */
export function TrashList({ onChanged }: { onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<Trashed[] | null>(null)
  const reload = useCallback(async () => setItems((await api<{ items: Trashed[] }>('/api/gtd/trash')).items), [])
  useEffect(() => { void reload() }, [reload])
  if (!items || items.length === 0) return null
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-medium text-gray-700">Trash <span className="text-gray-400">({items.length})</span></h2>
      <ul className="space-y-1">
        {items.slice(0, 30).map((t) => (
          <li key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-sm text-gray-600 break-words">{t.title}{t.under ? <span className="text-gray-400"> (+{t.under} under it)</span> : null}</p>
              <p className="text-[11px] text-gray-400">from {t.from}{t.at ? ` · ${t.at.replace(/[[\]]/g, '')}` : ''}</p>
            </div>
            <span className="flex shrink-0 gap-3 text-xs">
              <button className="text-sky-800 hover:underline" onClick={async () => { await api('/api/gtd/restore', 'POST', { id: t.id }); await Promise.all([reload(), onChanged()]) }}>Restore</button>
              <button className="text-red-700 hover:underline" onClick={async () => {
                if (!confirm(`Delete "${t.title}" for good?`)) return
                await api('/api/gtd/trash', 'DELETE', { id: t.id })
                await reload()
              }}>Delete for good</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Projects ──────────────────────────────────────────────────────────────────

export type Project = {
  domain: string
  domainTitle: string
  front: ChainNode
  /** Open steps under it. */
  open: number
  /** The day it was last moved on (a step ticked off), if ever. */
  moved: string | null
  /** A day it is snoozed until, if it is. */
  until: string | null
}

/** How long a project can go without a step done before it is marked stalled, as in Dough. */
export const STALL_DAYS = 14

/**
 * The projects in the outlines: every top-level heading that is not a single
 * task (it has no TODO of its own) and not a plain list (tagged `area`, like
 * Bills or Tasks). Dough's fronts are projects in exactly this sense.
 */
export function projectsOf(outline: { domain: { key: string; title: string }; fronts: ChainNode[] }[]): Project[] {
  const out: Project[] = []
  const today = todayIso()
  for (const { domain, fronts } of outline) {
    for (const f of fronts) {
      if (f.todo || f.done || f.tags.includes('area')) continue
      let open = 0
      let moved: string | null = null
      const walk = (n: ChainNode) => {
        if (n !== f && n.todo && !n.done && !n.someday) open++
        const m = n.closed && /(\d{4}-\d{2}-\d{2})/.exec(n.closed)
        if (m && (!moved || m[1] > moved)) moved = m[1]
        n.children.forEach(walk)
      }
      walk(f)
      out.push({ domain: domain.key, domainTitle: domain.title, front: f, open, moved, until: f.snoozeDate && f.snoozeDate > today ? f.snoozeDate : null })
    }
  }
  return out
}

const daysSince = (day: string) => Math.floor((Date.parse(`${todayIso()}T12:00:00`) - Date.parse(`${day}T12:00:00`)) / 86_400_000)

/**
 * Projects down the side of Next: each with what is next in it, and park and
 * snooze as in Dough. Click one to focus Next on it.
 */
export function ProjectsPanel({ projects, items, selected, onSelect, onChanged, onFlash }: {
  projects: Project[]
  items: NextAction[]
  selected: string | null
  onSelect: (id: string | null) => void
  onChanged: () => Promise<void>
  onFlash: (text: string, undo?: () => Promise<void>) => void
}) {
  const [showParked, setShowParked] = useState(false)
  const [snoozing, setSnoozing] = useState<string | null>(null)
  const active = projects.filter((p) => !p.front.parked)
  const parked = projects.filter((p) => p.front.parked)
  const set = async (p: Project, field: string, value: string, said: string, undo?: string) => {
    await chainOp(p.domain, { op: 'set', id: p.front.id, field, value })
    onFlash(said, undo === undefined ? undefined : async () => { await chainOp(p.domain, { op: 'set', id: p.front.id, field, value: undo }); await onChanged() })
    await onChanged()
  }
  const nextOf = (p: Project) => items.find((a) => a.frontId === p.front.id)
  return (
    <nav aria-label="Projects" className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-gray-700">Projects <span className="text-gray-400">({active.length})</span></h2>
        {selected && <button className="text-xs text-sky-800 hover:underline" onClick={() => onSelect(null)}>show all</button>}
      </div>
      {active.map((p) => {
        const next = nextOf(p)
        const stalled = !p.until && (p.moved ? daysSince(p.moved) > STALL_DAYS : false)
        return (
          <div key={p.front.id}
            className={`rounded-lg border px-2.5 py-2 ${selected === p.front.id ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white hover:border-gray-300'} ${p.until ? 'opacity-60' : ''}`}>
            <button className="block w-full text-left" onClick={() => onSelect(selected === p.front.id ? null : p.front.id)}>
              <span className="block text-sm font-medium text-gray-900 break-words">{p.front.title}</span>
              <span className="block text-[11px] text-gray-500">
                {p.domainTitle} · {p.open} open
                {p.until && ` · until ${pretty(p.until)}`}
                {stalled && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">stalled {daysSince(p.moved!)} d</span>}
              </span>
              {!p.until && (
                <span className={`mt-0.5 block text-xs break-words ${next?.needsStep || !next ? 'text-amber-800' : 'text-gray-700'}`}>
                  {next && !next.needsStep ? `→ ${next.title}` : 'needs a next step'}
                </span>
              )}
            </button>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
              {p.domain === 'money' && <a className="text-sky-800 hover:underline" href={`/dough/front/${p.front.id}`}>Dough</a>}
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setSnoozing(snoozing === p.front.id ? null : p.front.id)}>{p.until ? 'Reschedule' : 'Snooze'}</button>
              {p.until && <button className="text-gray-500 hover:text-gray-800" onClick={async () => { await api('/api/gtd/snooze', 'POST', { place: p.domain, id: p.front.id, until: null }); onFlash(`Awake: ${p.front.title}`); await onChanged() }}>Wake</button>}
              <button className="text-gray-500 hover:text-gray-800" onClick={() => set(p, 'parked', 't', `Parked: ${p.front.title}`, 'nil')}>Park</button>
              {p.domain === 'life' && (
                <button className="text-gray-400 hover:text-gray-800" title="Bills, Tasks and the like: a list of things, not one outcome"
                  onClick={() => set(p, 'area', 't', `${p.front.title} is a list now, not a project`, 'nil')}>a list, not a project</button>
              )}
            </div>
            {snoozing === p.front.id && (
              <div className="mt-1.5">
                <SnoozeMenu onSnooze={async (when) => {
                  setSnoozing(null)
                  await api('/api/gtd/snooze', 'POST', { place: p.domain, id: p.front.id, until: when })
                  onFlash(`Snoozed until ${pretty(when)}: ${p.front.title}`)
                  await onChanged()
                }} />
              </div>
            )}
          </div>
        )
      })}
      {parked.length > 0 && (
        <div className="pt-1">
          <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setShowParked((s) => !s)}>
            {showParked ? '▾' : '▸'} Parked ({parked.length})
          </button>
          {showParked && parked.map((p) => (
            <div key={p.front.id} className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5">
              <span className="min-w-0 text-xs text-gray-600 break-words">{p.front.title} <span className="text-gray-400">· {p.domainTitle}</span></span>
              <button className="shrink-0 text-[11px] text-sky-800 hover:underline" onClick={() => set(p, 'parked', 'nil', `Back from the park: ${p.front.title}`, 't')}>Unpark</button>
            </div>
          ))}
        </div>
      )}
    </nav>
  )
}

// ── Renaming ──────────────────────────────────────────────────────────────────

/**
 * A task's (or project's, or inbox item's) name you can change in place:
 * double-click it, or press ✎. Enter or clicking away saves, Esc cancels.
 */
export function EditableTitle({ place, id, title, display, className, onSaved, onEditingChange, editRequest }: {
  place: string
  id: string
  title: string
  /** Bump it to open the name for editing from outside (a "Rename" button). */
  editRequest?: number
  /** What to show when not editing, if not the title itself. */
  display?: React.ReactNode
  className?: string
  onSaved?: (title: string) => void | Promise<void>
  onEditingChange?: (editing: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [shown, setShown] = useState(title)
  const [error, setError] = useState('')
  useEffect(() => setShown(title), [title])
  const start = (e?: React.SyntheticEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setEditing(true)
    onEditingChange?.(true)
  }
  const stop = () => { setEditing(false); onEditingChange?.(false) }
  useEffect(() => {
    if (editRequest) { setEditing(true); onEditingChange?.(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])
  const save = async (value: string) => {
    const next = value.replace(/[\r\n]+/g, ' ').trim()
    stop()
    if (!next || next === shown) return
    const before = shown
    setShown(next)
    setError('')
    try {
      await api('/api/gtd/rename', 'POST', { place, id, title: next })
      await onSaved?.(next)
    } catch (err) {
      setShown(before)
      setError(message(err))
    }
  }
  if (editing) {
    return (
      <input autoFocus defaultValue={shown} aria-label="Name"
        className="w-full rounded border border-sky-400 bg-white px-1.5 py-0.5 text-[inherit] font-[inherit] text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void save(e.currentTarget.value) }
          if (e.key === 'Escape') { e.preventDefault(); stop() }
        }}
        onBlur={(e) => void save(e.currentTarget.value)} />
    )
  }
  return (
    <span className={`group/title ${className ?? ''}`} onDoubleClick={start} title="Double-click to rename">
      {display ?? shown}
      <button type="button" aria-label={`Rename ${shown}`} onClick={start}
        className="ml-1 align-baseline text-[0.8em] text-gray-300 hover:text-sky-700 sm:opacity-0 sm:group-hover/title:opacity-100 focus:opacity-100">
        ✎
      </button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
    </span>
  )
}

// ── Search ────────────────────────────────────────────────────────────────────

export type SearchHit = {
  file: string
  place: string | null
  placeTitle: string
  chainId: string | null
  title: string
  todo: string | null
  done: boolean
  olp: string[]
  snippet: string | null
}

/** Shows `text` with every word of `q` marked. */
function Marked({ text, q }: { text: string; q: string }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-yellow-100 px-0.5 text-inherit">{p}</mark> : p))}</>
}

/**
 * Search across Next's notes (Life, Money, the inbox, the agenda notes) by a
 * task's name and the text written under it, as you type. "/" jumps here.
 */
export type ExtraHit = { frontId: string; frontTitle: string; kind: 'amount' | 'link' | 'document'; title: string; snippet: string | null }
const EXTRA_ICON: Record<ExtraHit['kind'], string> = { amount: 'kr', link: '🔗', document: '📎' }

/** Search titles and the text inside. With `place`, only that domain, plus its own things (`onOpenExtra`). */
export function NextSearch({ onOpen, place, placeholder = 'Search tasks…  ( / )', onOpenExtra }: {
  onOpen: (hit: SearchHit) => void
  place?: string
  placeholder?: string
  onOpenExtra?: (hit: ExtraHit) => void
}) {
  const [q, setQ] = useState('')
  const [done, setDone] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [extras, setExtras] = useState<ExtraHit[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const slash = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); box.current?.focus() }
    }
    window.addEventListener('keydown', slash)
    return () => window.removeEventListener('keydown', slash)
  }, [])
  useEffect(() => {
    if (!q.trim()) { setHits(null); return }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/gtd/search?q=${encodeURIComponent(q)}&done=${done ? 1 : 0}${place ? `&place=${place}` : ''}`, { signal: ctl.signal })
        const json = await res.json()
        setHits(json.hits ?? [])
        setExtras(json.extras ?? [])
      } catch { /* a newer search replaced it */ }
    }, 150)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q, done, place])
  return (
    <div className="relative w-full sm:w-72">
      <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); box.current?.blur() } }}
        placeholder={placeholder} aria-label={place ? 'Search' : 'Search tasks'}
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      {open && q.trim() && hits && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
            <label className="mb-1 flex items-center gap-1.5 px-1 text-xs text-gray-500">
              <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="accent-sky-700" /> include done
            </label>
            {hits.length === 0 && extras.length === 0 && <p className="px-2 py-3 text-sm text-gray-400">Nothing matches &ldquo;{q}&rdquo;.</p>}
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.file}:${h.chainId ?? i}`}>
                  <button className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-sky-50" onClick={() => { setOpen(false); onOpen(h) }}>
                    <span className={`block text-sm ${h.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {h.todo && !h.done && h.todo !== 'TODO' && <span className="mr-1 text-[10px] font-semibold text-sky-800">{h.todo}</span>}
                      <Marked text={h.title} q={q} />
                    </span>
                    <span className="block text-[11px] text-gray-500">{[h.placeTitle, ...h.olp.slice(1)].join(' › ')}</span>
                    {h.snippet && <span className="block text-xs text-gray-600"><Marked text={h.snippet} q={q} /></span>}
                  </button>
                </li>
              ))}
            </ul>
            {extras.length > 0 && (
              <>
                <p className="mt-1 border-t border-gray-100 px-2 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Amounts, links and documents</p>
                <ul>
                  {extras.map((h, i) => (
                    <li key={`x${i}`}>
                      <button className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-sky-50" onClick={() => { setOpen(false); onOpenExtra?.(h) }}>
                        <span className="block text-sm text-gray-900"><span className="mr-1.5 text-xs text-gray-500">{EXTRA_ICON[h.kind]}</span><Marked text={h.title} q={q} /></span>
                        <span className="block text-[11px] text-gray-500">{h.frontTitle}</span>
                        {h.snippet && <span className="block truncate text-xs text-gray-600"><Marked text={h.snippet} q={q} /></span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
