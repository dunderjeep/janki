'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NextSearch } from '@/components/chains/gtd'
import ChainTree from '@/components/chains/ChainTree'
import { api, chainOp, FlashBar, message, NextList, PopCard, useNextActions } from '@/components/chains/NextList'
import type { ChainNode } from '@/lib/chains/tree'
import { CURRENCIES, formatMoney, type FrontSignal } from '@/lib/dough/money'
import type { DoughView } from '@/lib/dough/view'
import MoneyLinks from './MoneyLinks'
import WorkspaceLink from './WorkspaceLink'

const STALL_DAYS = 14
const NONE: never[] = []

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000)
}

function Moved({ at }: { at: string | null }) {
  if (!at) return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">no moves yet</span>
  const d = daysSince(at)
  if (d > STALL_DAYS) return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">stalled {d} days</span>
  return <span className="text-xs text-gray-500">moved {d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}</span>
}

function Purpose({ front, onSave }: { front: ChainNode; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(front.purpose ?? '')
  if (editing) {
    return (
      <form
        className="mt-1"
        onSubmit={(e) => {
          e.preventDefault()
          setEditing(false)
          if (text.trim() !== (front.purpose ?? '')) onSave(text.trim())
        }}
      >
        <input
          autoFocus
          className="w-full rounded border border-sky-300 px-2 py-1 text-sm focus:outline-none"
          placeholder="What cracking this would mean"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      </form>
    )
  }
  return (
    <button className="mt-0.5 text-left text-xs text-gray-600 hover:text-sky-800 break-words" onClick={() => setEditing(true)}>
      {front.purpose ? `Why: ${front.purpose}` : '+ Why this front'}
    </button>
  )
}

function Tallies({ frontId, signal, onChanged }: { frontId: string; signal: FrontSignal; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string>('NOK')
  const [onDate, setOnDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = 'rounded-md border border-gray-200 bg-white px-2 py-1 text-sm'
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api('/api/dough/tallies', 'POST', { frontId, amount, currency, onDate, note })
      setAmount('')
      setNote('')
      setOpen(false)
      await onChanged()
    } catch (err) {
      setError(message(err))
    }
  }
  const remove = async (id: string) => {
    if (!window.confirm('Remove this amount?')) return
    await api(`/api/dough/tallies/${id}`, 'DELETE').catch((err) => setError(message(err)))
    await onChanged()
  }
  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      {signal.tallies.length > 0 && (
        <ul className="mb-1 space-y-0.5 text-xs text-gray-600">
          {signal.tallies.map((t) => (
            <li key={t.id} className="flex justify-between gap-2">
              <span className="break-words">{t.onDate} · {formatMoney({ [t.currency]: t.amountCents })}{t.note && ` · ${t.note}`}</span>
              <button className="text-gray-400 hover:text-red-700" aria-label="Remove" onClick={() => remove(t.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={save}>
          <input className={`${field} w-24`} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={field} type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
          <input className={`${field} min-w-0 flex-1`} placeholder="Note (e.g. 2 Gumroad sales)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800">Add</button>
          <button type="button" className="text-xs text-gray-500" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      ) : (
        <button className="text-xs text-sky-800 hover:underline" onClick={() => setOpen(true)}>+ Money in</button>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

function AddFront({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (t: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) return <button className="text-sm text-sky-800 hover:underline" onClick={() => setOpen(true)}>{label}</button>
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        await onAdd(text.trim())
        setText('')
        setOpen(false)
      }}
    >
      <input autoFocus className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm text-white">Add</button>
      <button type="button" className="text-xs text-gray-500" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  )
}

/** The money fronts: what can be done now, and each front's chains. */
export default function DoughApp({ initial, initialError }: { initial: DoughView | null; initialError: string | null }) {
  const [view, setView] = useState(initial)
  const [loadError, setLoadError] = useState(initialError)
  const reload = useCallback(async () => {
    try {
      setView(await api<DoughView>('/api/dough'))
      setLoadError(null)
    } catch (err) {
      setLoadError(message(err))
    }
  }, [])
  const { items, flash, setFlash, error, done, addStep, reorder, later } = useNextActions(view?.next ?? NONE, reload)
  const router = useRouter()
  const [focusId, setFocusId] = useState<string | null>(null)
  /** The front a heading is in (or is). */
  const frontOf = (id: string): ChainNode | null => {
    const has = (n: ChainNode): boolean => n.id === id || n.children.some(has)
    return view?.fronts.find(has) ?? null
  }

  const nextIds = useMemo(() => new Set(items.filter((a) => !a.needsStep && a.id).map((a) => a.id!)), [items])
  const needsIds = useMemo(() => new Set(items.filter((a) => a.needsStep && !a.needsFirstStep && a.id).map((a) => a.id!)), [items])

  if (!view) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Dough</h1>
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The fronts live in the note dough.org. {loadError}
        </p>
        <button className="mt-3 text-sm text-sky-800 hover:underline" onClick={reload}>Try again</button>
      </div>
    )
  }

  const op = async (body: Record<string, unknown>) => {
    try {
      const res = await chainOp('money', body)
      await reload()
      return res.id ?? null
    } catch (err) {
      setLoadError(message(err))
      return null
    }
  }
  const active = view.fronts.filter((f) => !f.parked && !f.done)
  const parked = view.fronts.filter((f) => f.parked)
  const { score } = view.signals
  const top = items[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dough</h1>
          <p className="text-sm text-gray-600">
            Money in this month: <strong>{formatMoney(score.month) || 'nothing yet'}</strong>
            <span className="mx-2 text-gray-300">|</span>
            this year: <strong>{formatMoney(score.year) || 'nothing yet'}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <NextSearch place="money" placeholder="Search Dough…  ( / )"
            onOpen={(h) => {
              const front = h.chainId ? frontOf(h.chainId) : null
              if (front && !front.parked && !front.done) {
                setFocusId(null)
                setTimeout(() => setFocusId(h.chainId), 0)
              } else if (front) {
                setFlash({ text: `${h.title}: in ${front.title}${front.parked ? ', a parked idea' : ', which is done'}` })
              }
            }}
            onOpenExtra={(h) => router.push(`/dough/front/${h.frontId}`)} />
          <Link href="/next" className="text-sm text-sky-800 hover:underline">Everything, all domains →</Link>
        </div>
      </div>

      <MoneyLinks links={view.links} onChanged={reload} />

      {(loadError || error) && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{loadError ?? error}</p>}
      <FlashBar flash={flash} onClose={() => setFlash(null)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <PopCard
            a={top}
            showDomain={false}
            onDone={() => top && done(top)}
            onLater={() => top && later(top)}
            onAdd={(t) => (top ? addStep(top, t) : Promise.resolve())}
          />
          <h2 className="mb-2 text-sm font-medium text-gray-700">
            Can do now <span className="text-gray-400">({items.length})</span>
          </h2>
          <NextList items={items} showDomain={false} onDone={done} onAdd={addStep} onReorder={reorder} />
        </div>

        <div className="space-y-4">
          {active.map((front) => {
            const signal = view.signals.fronts[front.id]
            return (
              <section key={front.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 break-words">
                      <Link href={`/dough/front/${front.id}`} className="hover:text-sky-800 hover:underline" title="Open this front's page">{front.title}</Link>
                    </h3>
                    <Purpose front={front} onSave={(v) => void op({ op: 'set', id: front.id, field: 'PURPOSE', value: v })} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dough/front/${front.id}`}
                      className={front.workspace ? 'rounded-md bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800' : 'text-xs text-sky-800 hover:underline'}
                    >
                      {front.workspace ? 'Work on it' : 'Focus'}
                    </Link>
                    <Moved at={signal?.lastMoved ?? null} />
                    <button
                      className="text-xs text-gray-500 hover:text-gray-800"
                      onClick={() => void op({ op: 'set', id: front.id, field: 'parked', value: 't' })}
                    >
                      Park
                    </button>
                  </div>
                </div>
                {signal?.line && <p className="mt-1 text-sm text-gray-700">{signal.line}</p>}
                {!front.workspace && (
                  <WorkspaceLink frontId={front.id} current={null} onChanged={reload} label="+ Workspace link (e.g. its Google Sheet)" />
                )}
                <div className="mt-3">
                  <ChainTree domain="money" front={front} nextIds={nextIds} needsIds={needsIds} onChanged={reload} focusId={focusId}
                    index={view.index} fronts={view.fronts} domainTitles={{ life: 'Life', money: 'Money' }} />
                </div>
                {front.signal === 'tally' && signal && <Tallies frontId={front.id} signal={signal} onChanged={reload} />}
              </section>
            )
          })}

          <AddFront label="+ New front" placeholder="A new way to make money" onAdd={async (t) => void (await op({ op: 'add', anchor: null, place: 'last', title: t, todo: false }))} />

          <section className="rounded-xl border border-dashed border-gray-300 p-4">
            <h3 className="text-sm font-medium text-gray-700">Parked ideas</h3>
            {parked.length === 0 && <p className="mt-1 text-xs text-gray-500">None.</p>}
            <ul className="mt-1 space-y-1">
              {parked.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                  <span className="break-words">{f.title}</span>
                  <button
                    className="shrink-0 text-xs text-sky-800 hover:underline"
                    onClick={() => void op({ op: 'set', id: f.id, field: 'parked', value: 'nil' })}
                  >
                    Make it a front
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <AddFront
                label="+ Park an idea"
                placeholder="An idea for later"
                onAdd={async (t) => {
                  const id = await op({ op: 'add', anchor: null, place: 'last', title: t, todo: false })
                  if (id) await op({ op: 'set', id, field: 'parked', value: 't' })
                }}
              />
            </div>
          </section>
          <p className="text-xs text-gray-500">
            Stored in the note dough.org, which Next and Quilt read too. A front with no move for {STALL_DAYS} days is marked stalled.
          </p>
        </div>
      </div>
    </div>
  )
}
