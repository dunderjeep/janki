'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import type { ChainIndex, NextAction } from '@/lib/chains/tree'
import { JobControls } from 'joblowski/ui'
import { LinkChips } from './links'
import { dragTask, EditableTitle, GtdBadges, SnoozeMenu } from './gtd'

export async function api<T = { ok: boolean; id?: string | null }>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `The request failed (${res.status})`)
  return json as T
}

export const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')

export const chainOp = (domain: string, body: Record<string, unknown>) => api(`/api/chains/${domain}`, 'POST', body)

type Flash = { text: string; undo?: () => Promise<void> }

/**
 * What can be done now, in the order you put it in. Tick one off and the
 * next step of its chain takes its place; the flash says what that is.
 */
export function useNextActions(initial: NextAction[], reload: () => Promise<void>) {
  const [items, setItems] = useState(initial)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setItems(initial), [initial])

  const guard = async (work: () => Promise<void>) => {
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(message(err))
    }
    await reload().catch((err) => setError(message(err)))
  }

  const done = (a: NextAction) =>
    guard(async () => {
      setItems((all) => all.filter((x) => x.key !== a.key))
      if (a.source === 'task' && a.task) {
        await api('/api/chains/tasks', 'POST', a.task)
        setFlash({ text: `Done: ${a.title}` })
        return
      }
      await chainOp(a.domain, { op: 'set', id: a.id, field: 'todo', value: 'DONE' })
      setFlash({
        text: a.then ? `Done: ${a.title}. Up next: ${a.then}` : `Done: ${a.title}. That chain is empty now.`,
        undo: () => guard(async () => {
          await chainOp(a.domain, { op: 'set', id: a.id, field: 'todo', value: 'TODO' })
          setFlash(null)
        }),
      })
    })

  const addStep = (a: NextAction, title: string) =>
    guard(async () => {
      await chainOp(a.domain, { op: 'add', anchor: a.id, place: 'last', title })
    })

  const reorder = (keys: string[]) =>
    guard(async () => {
      const ordered = keys.map((k) => items.find((x) => x.key === k)).filter((x): x is NextAction => Boolean(x))
      setItems(ordered)
      await api('/api/chains/focus', 'PUT', { keys: ordered.map((x) => x.slot) })
    })

  const later = (a: NextAction) => reorder([...items.filter((x) => x.key !== a.key).map((x) => x.key), a.key])

  const jobOp = (a: NextAction, body: Record<string, unknown>) => api(`/api/joblowski/applications/${a.job!.id}`, 'PATCH', body)

  /** Parks the tracked job behind a joblowski action, until a day if given. Undo unparks it. */
  const park = (a: NextAction, until: string | null) =>
    guard(async () => {
      setItems((all) => all.filter((x) => x.key !== a.key))
      await jobOp(a, { status: 'parked', parkedUntil: until })
      setFlash({
        text: until ? `Snoozed until ${until}: ${a.title}` : `Parked: ${a.title}`,
        undo: () => guard(async () => {
          await jobOp(a, { unpark: true })
          setFlash(null)
        }),
      })
    })

  /** Drops the job: marked withdrawn in the tracker, so the record stays. Undo puts its status back. */
  const dismiss = (a: NextAction) =>
    guard(async () => {
      setItems((all) => all.filter((x) => x.key !== a.key))
      await jobOp(a, { status: 'withdrawn' })
      setFlash({
        text: `Dismissed: ${a.title}. It is marked withdrawn in the tracker.`,
        undo: () => guard(async () => {
          await jobOp(a, { status: a.job!.status })
          setFlash(null)
        }),
      })
    })

  return { items, flash, setFlash, error, done, addStep, reorder, later, park, dismiss }
}

function Where({ a, showDomain }: { a: NextAction; showDomain: boolean }) {
  const crumbs = [...(showDomain ? [a.domainTitle] : []), ...a.path]
  if (crumbs.length === 0 && !a.deadline) return null
  return (
    <p className="mt-0.5 text-xs text-gray-500 break-words">
      {crumbs.join(' › ')}
      {a.deadline && <span className="ml-2 text-amber-800">due {a.deadline.replace(/[<>\[\]]/g, '')}</span>}
    </p>
  )
}

function StepInput({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<void> }) {
  const [text, setText] = useState('')
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        await onAdd(text.trim())
        setText('')
      }}
    >
      <input
        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800">Add</button>
    </form>
  )
}

/** What a needs-a-step item asks you, in words. */
const askFor = (a: NextAction) =>
  a.needsFirstStep ? `What's the next step for ${a.title}?` : `Every step of "${a.title}" is done. What's next, or is it finished?`

/** "In outline" for chain steps, when the page has an outline to show them in. */
export function ActionLinks({ a, onLocate }: { a: NextAction; onLocate?: (a: NextAction) => void }) {
  if (!(onLocate && a.source === 'chain' && a.id)) return null
  return (
    <span className="inline-flex gap-3">
      <button className="text-xs text-sky-800 hover:underline" onClick={() => onLocate(a)}>In outline</button>
    </span>
  )
}

/** The Outline's actions for a step (rename, + then, break down, link, move, delete); `rename` opens its name. */
export type StepsSlot = (a: NextAction, rename: () => void) => ReactNode

function Row({ a, showDomain, onDone, onAdd, onPark, onDismiss, index, onLocate, tools, steps, onRenamed }: {
  a: NextAction
  showDomain: boolean
  index?: ChainIndex
  onLocate?: (a: NextAction) => void
  onDone: () => void
  onAdd: (t: string) => Promise<void>
  onPark?: (until: string | null) => void
  onDismiss?: () => void
  /** The task's GTD tools (snooze, contexts, files…), shown under it on ⋯. */
  tools?: (a: NextAction) => ReactNode
  steps?: StepsSlot
  /** After a rename, to reload. Without it, names are not editable here. */
  onRenamed?: () => void | Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.key })
  const [open, setOpen] = useState(false)
  const canTool = Boolean(tools && a.source === 'chain' && a.id && !a.needsStep)
  const canRename = Boolean(onRenamed && a.source === 'chain' && a.id && !a.needsStep)
  const [renaming, setRenaming] = useState(false)
  const [renameTick, setRenameTick] = useState(0)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded-lg border bg-white px-2 py-2 ${isDragging ? 'z-10 shadow-lg border-sky-300' : 'border-gray-200'} ${a.needsStep ? 'bg-amber-50/60 border-amber-200' : ''}`}
    >
      <button
        className="mt-0.5 cursor-grab touch-none select-none px-1 text-gray-400 hover:text-gray-700"
        aria-label={`Drag ${a.title}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      {!a.needsStep && a.source !== 'joblowski' && (
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-sky-700" aria-label={`Done: ${a.title}`} onChange={onDone} />
      )}
      {a.source === 'joblowski' && <span className="mt-0.5 shrink-0 text-sm" aria-hidden>💼</span>}
      <div className="min-w-0 flex-1">
        <p className={`text-sm break-words ${a.needsStep ? 'text-amber-950' : 'text-gray-900'} ${canTool && !renaming ? 'cursor-grab' : ''}`}
          draggable={canTool && !renaming}
          onDragStart={canTool && !renaming ? (e) => dragTask(e, { domain: a.domain, id: a.id!, title: a.title }) : undefined}
          title={canTool ? 'Click for its actions · drag onto a calendar day to schedule it' : undefined}
          onClick={canTool && !renaming ? () => setOpen((o) => !o) : undefined}>
          {canRename
            ? <EditableTitle place={a.domain} id={a.id!} title={a.title} onSaved={onRenamed} onEditingChange={setRenaming} editRequest={renameTick} />
            : a.needsStep ? askFor(a) : a.title}
        </p>
        <Where a={a} showDomain={showDomain} />
        <GtdBadges a={a} />
        {!a.needsStep && a.then && <p className="text-xs text-gray-400 break-words">then: {a.then}</p>}
        <LinkChips links={a.links} waits={a.waits} index={index} onJump={onLocate && ((id) => onLocate({ ...a, id }))} />
        {a.source !== 'joblowski' && <ActionLinks a={a} onLocate={onLocate} />}
        {a.source === 'joblowski' && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Link href={a.href} className="text-sky-800 hover:underline">Open in Joblowski</Link>
            {onPark && a.job && <JobControls onPark={onPark} onDismiss={onDismiss} />}
          </div>
        )}
        {a.needsStep && (
          <>
            <StepInput placeholder="The next physical action" onAdd={onAdd} />
            {!a.needsFirstStep && (
              <button className="mt-1 text-xs text-sky-800 hover:underline" onClick={onDone}>It&apos;s finished</button>
            )}
          </>
        )}
        {open && canTool && steps?.(a, () => setRenameTick((n) => n + 1))}
        {open && canTool && tools!(a)}
      </div>
      {canTool && (
        <button className={`shrink-0 rounded px-1.5 text-gray-400 hover:text-gray-800 ${open ? 'bg-gray-100 text-gray-800' : ''}`}
          aria-label={`More for ${a.title}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      )}
    </li>
  )
}

export function FlashBar({ flash, onClose }: { flash: Flash | null; onClose: () => void }) {
  if (!flash) return null
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-900" role="status">
      <span className="break-words">{flash.text}</span>
      <span className="flex shrink-0 gap-3">
        {flash.undo && <button className="text-green-800 underline" onClick={() => void flash.undo!()}>Undo</button>}
        <button className="text-green-800" aria-label="Dismiss" onClick={onClose}>×</button>
      </span>
    </div>
  )
}

/**
 * "Not now": schedule it for later (tomorrow, the weekend, next week, a month,
 * a day and time), or just skip it for now, to the bottom of the order. On a
 * "what's the next step?" card it is the whole project that waits.
 */
function NotNow({ a, onLater, onSnooze }: { a: NextAction; onLater: () => void; onSnooze?: (when: string) => void }) {
  const [open, setOpen] = useState(false)
  const canSnooze = Boolean(onSnooze && a.source === 'chain' && a.id)
  if (!canSnooze) {
    return <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-sky-500" onClick={onLater}>Not now</button>
  }
  return (
    <>
      <button className={`rounded-lg border px-3 py-2 text-sm text-gray-700 hover:border-sky-500 ${open ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white'}`}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>Not now ▾</button>
      {open && (
        <div className="basis-full rounded-lg border border-gray-200 bg-white p-2.5">
          <p className="mb-1.5 text-xs text-gray-600">{a.needsStep ? `Put "${a.title}" away until…` : 'Back on your list…'}</p>
          <SnoozeMenu onSnooze={(when) => { setOpen(false); onSnooze!(when) }} />
          <button className="mt-2 text-xs text-gray-500 hover:text-gray-800" onClick={() => { setOpen(false); onLater() }}>
            Just skip it for now (to the bottom of the list)
          </button>
        </div>
      )}
    </>
  )
}

/** The one thing at the top of the list, for a spare five minutes. */
export function PopCard({ a, showDomain, onDone, onLater, onAdd, onSnooze, onRenamed, steps }: {
  a: NextAction | undefined; showDomain: boolean; onDone: () => void; onLater: () => void; onAdd: (t: string) => Promise<void>
  steps?: StepsSlot
  /** Schedule the card's task (or, asking for a step, its project) for later. */
  onSnooze?: (when: string) => void
  onRenamed?: () => void | Promise<void>
}) {
  const [renameTick, setRenameTick] = useState(0)
  if (!a) {
    return (
      <section className="mb-4 rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">
        Nothing to do here. Every chain is finished, parked or snoozed.
      </section>
    )
  }
  return (
    <section className="mb-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-800">Got a spare moment? Do this one</p>
      <p className="mt-1 text-lg font-semibold text-gray-900 break-words">
        {onRenamed && a.source === 'chain' && a.id && !a.needsStep
          ? <EditableTitle key={a.key} place={a.domain} id={a.id} title={a.title} onSaved={onRenamed} editRequest={renameTick} />
          : a.needsStep ? askFor(a) : a.title}
      </p>
      <Where a={a} showDomain={showDomain} />
      {a.purpose && <p className="mt-1 text-xs text-gray-600 break-words">Why: {a.purpose}</p>}
      {!a.needsStep && a.then && <p className="mt-1 text-xs text-gray-500 break-words">After this: {a.then}</p>}
      {a.source !== 'joblowski' && <p className="mt-1"><ActionLinks a={a} /></p>}
      {a.needsStep ? (
        <StepInput placeholder="The next physical action" onAdd={onAdd} />
      ) : a.source === 'joblowski' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={a.href} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">Open in Joblowski</Link>
          <button className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-sky-500" onClick={onLater}>Not now</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800" onClick={onDone}>Done</button>
          <NotNow a={a} onLater={onLater} onSnooze={onSnooze} />
        </div>
      )}
      {steps && a.source === 'chain' && a.id && !a.needsStep && (
        <div className="mt-2" key={a.key}>{steps(a, () => setRenameTick((n) => n + 1))}</div>
      )}
      {a.needsStep && (
        <div className="mt-2 flex flex-wrap gap-2"><NotNow a={a} onLater={onLater} onSnooze={onSnooze} /></div>
      )}
    </section>
  )
}

export function NextList({ items, showDomain, onDone, onAdd, onReorder, onPark, onDismiss, index, onLocate, tools, steps, onRenamed }: {
  items: NextAction[]
  /** Every heading, to show links by name. */
  index?: ChainIndex
  /** Show a chain step in the page's outline. */
  onLocate?: (a: NextAction) => void
  showDomain: boolean
  onDone: (a: NextAction) => void
  onAdd: (a: NextAction, title: string) => Promise<void>
  onReorder: (keys: string[]) => void
  /** For joblowski actions: park or snooze the job, and dismiss it, from the list. */
  onPark?: (a: NextAction, until: string | null) => void
  onDismiss?: (a: NextAction) => void
  tools?: (a: NextAction) => ReactNode
  steps?: StepsSlot
  onRenamed?: () => void | Promise<void>
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const keys = items.map((a) => a.key)
    onReorder(arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))))
  }
  if (items.length === 0) return <p className="text-sm text-gray-500">Nothing waiting.</p>
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((a) => a.key)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {items.map((a) => (
            <Row
              key={a.key}
              a={a}
              showDomain={showDomain}
              onDone={() => onDone(a)}
              onAdd={(t) => onAdd(a, t)}
              onPark={onPark && ((until) => onPark(a, until))}
              onDismiss={onDismiss && (() => onDismiss(a))}
              index={index}
              onLocate={onLocate}
              tools={tools}
              steps={steps}
              onRenamed={onRenamed}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
