'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { contains, type ChainIndex, type ChainNode } from '@/lib/chains/tree'
import { chainOp, message } from './NextList'
import { LinkChips, linkOptions, Picker, type PickOption } from './links'

type RowInfo = { node: ChainNode; depth: number; parent: ChainNode }
type Adding = { anchor: string; place: 'after' | 'first' | 'last'; depth: number }
type Action = 'after' | 'first' | 'order' | 'delete' | 'link' | 'move'

function flatten(parent: ChainNode, depth: number, showDone: boolean, out: RowInfo[] = []): RowInfo[] {
  for (const node of parent.children) {
    if (node.done && !showDone) continue
    out.push({ node, depth, parent })
    flatten(node, depth + 1, showDone, out)
  }
  return out
}

const countDone = (n: ChainNode): number => n.children.reduce((s, c) => s + (c.done ? 1 : 0) + countDone(c), 0)

function AddInput({ depth, placeholder, onAdd, onClose }: {
  depth: number; placeholder: string; onAdd: (t: string) => Promise<void>; onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <li style={{ paddingLeft: `${depth * 1.25 + 1.75}rem` }} className="py-1">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim() || busy) return
          setBusy(true)
          await onAdd(text.trim())
          setBusy(false)
          setText('')
        }}
      >
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-sky-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={onClose}>Close</button>
      </form>
    </li>
  )
}

function Row({ row, isNext, needsStep, selected, onSelect, onToggle, onRename, onAction, domain, index, canMove, onJump, onUnlink, panel }: {
  row: RowInfo
  isNext: boolean
  needsStep: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onRename: (t: string) => void
  onAction: (a: Action) => void
  domain: string
  index?: ChainIndex
  canMove: boolean
  onJump?: (id: string) => void
  onUnlink: (id: string, kind: 'link' | 'wait') => void
  /** The link or move picker, open under this row. */
  panel: React.ReactNode
}) {
  const { node, depth } = row
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id })
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(node.title)
  const action = 'text-xs text-sky-800 hover:underline'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: `${depth * 1.25}rem` }}
      id={`chain-${node.id}`}
      className={`rounded-md ${isDragging ? 'relative z-10 bg-white shadow-lg' : ''}`}
    >
      <div className={`flex items-start gap-1.5 rounded-md px-1 py-1 ${isNext ? 'bg-sky-50' : ''} ${selected ? 'ring-1 ring-sky-300' : ''}`}>
        <button
          className="mt-0.5 cursor-grab touch-none select-none px-0.5 text-xs text-gray-300 hover:text-gray-600"
          aria-label={`Drag ${node.title}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        {node.todo ? (
          <input
            type="checkbox"
            className="mt-1 h-3.5 w-3.5 shrink-0 accent-sky-700"
            checked={node.done}
            aria-label={node.done ? `Not done: ${node.title}` : `Done: ${node.title}`}
            onChange={onToggle}
          />
        ) : (
          <span className="mt-1 h-3.5 w-3.5 shrink-0 text-center text-xs text-gray-400">▸</span>
        )}
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setEditing(false)
                if (text.trim() && text.trim() !== node.title) onRename(text.trim())
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-sky-300 px-1.5 py-0.5 text-sm focus:outline-none"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => e.key === 'Escape' && (setText(node.title), setEditing(false))}
              />
            </form>
          ) : (
            <button
              className={`text-left text-sm break-words ${node.done ? 'text-gray-400 line-through' : 'text-gray-900'} ${node.todo ? '' : 'font-medium'}`}
              onClick={onSelect}
            >
              {node.title}
              {isNext && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">next</span>}
              {needsStep && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">what&apos;s next?</span>}
              {!node.ordered && node.children.length > 0 && <span className="ml-2 text-[11px] text-gray-400">any order</span>}
              {node.deadline && <span className="ml-2 text-[11px] text-amber-800">due {node.deadline.replace(/[<>\[\]]/g, '')}</span>}
            </button>
          )}
          <LinkChips links={node.links} waits={node.waits} index={index} onJump={onJump} onRemove={selected ? onUnlink : undefined} />
          {selected && !editing && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <button className={action} onClick={() => { setText(node.title); setEditing(true) }}>Rename</button>
              <button className={action} onClick={() => onAction('after')}>+ then</button>
              <button className={action} onClick={() => onAction('first')} title="Add a step under it: that makes it a project">
                {node.children.length ? '+ step inside' : 'Break down'}
              </button>
              {node.children.length > 0 && (
                <button className={action} onClick={() => onAction('order')}>{node.ordered ? 'Steps in any order' : 'Steps in order'}</button>
              )}
              {index && <button className={action} onClick={() => onAction('link')}>Link…</button>}
              {canMove && <button className={action} onClick={() => onAction('move')}>Move to…</button>}
              <button className="text-xs text-red-700 hover:underline" onClick={() => onAction('delete')}>Delete</button>
            </div>
          )}
          {selected && panel}
        </div>
      </div>
    </li>
  )
}

/**
 * One front's chains as an outline. Drag a step anywhere, even into another
 * project; tap one for its actions. "+ then" adds the step after it, "Break
 * down" a smaller first step under it.
 */
export default function ChainTree({ domain, front, nextIds, needsIds, onChanged, index, fronts, domainTitles = {}, focusId, onJump, wholeFile }: {
  domain: string
  front: ChainNode
  nextIds: Set<string>
  needsIds: Set<string>
  onChanged: () => Promise<void>
  /** Every heading everywhere: turns on links ("Link…" and the chips). */
  index?: ChainIndex
  /** All of this domain's fronts: turns on "Move to…" between them. */
  fronts?: ChainNode[]
  domainTitles?: Record<string, string>
  /** A heading to select and scroll to. */
  focusId?: string | null
  /** Follow a link chip. */
  onJump?: (id: string) => void
  /**
   * `front` is a stand-in for the whole file: its children are the fronts.
   * Adding to it or moving into it then means the top level.
   */
  wholeFile?: boolean
}) {
  const [showDone, setShowDone] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ id: string; kind: 'link' | 'move' } | null>(null)
  const [waits, setWaits] = useState(false)

  useEffect(() => {
    if (!focusId || !contains(front, focusId)) return
    setSelected(focusId)
    if (index?.[focusId]?.done) setShowDone(true)
    // After the render that shows it.
    setTimeout(() => document.getElementById(`chain-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }, [focusId, front, index])
  const [adding, setAdding] = useState<Adding | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rows = flatten(front, 0, showDone)
  const done = countDone(front)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const run = async (body: Record<string, unknown>) => {
    setError(null)
    // The stand-in root of a whole file is not a heading: in Emacs it is the top level.
    if (wholeFile) {
      if (body.anchor === front.id) body = { ...body, anchor: null }
      if (body.parent === front.id) body = { ...body, parent: null }
    }
    try {
      const res = await chainOp(domain, body)
      await onChanged()
      return res.id ?? null
    } catch (err) {
      setError(message(err))
      await onChanged().catch(() => undefined)
      return null
    }
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = rows.findIndex((r) => r.node.id === active.id)
    const to = rows.findIndex((r) => r.node.id === over.id)
    if (from < 0 || to < 0) return
    const moving = rows[from].node
    const target = rows[to]
    if (contains(moving, target.node.id)) return
    // Counted among all siblings, done ones too: Emacs sees every heading.
    const siblings = target.parent.children.filter((c) => c.id !== moving.id)
    const index = siblings.findIndex((c) => c.id === target.node.id) + (from < to ? 1 : 0)
    void run({ op: 'move', id: moving.id, parent: target.parent.id, index })
  }

  const setIds = (node: ChainNode, field: 'LINKS' | 'WAITS', ids: string[]) =>
    void run({ op: 'set', id: node.id, field, value: [...new Set(ids)].join(' ') })

  const unlink = (node: ChainNode) => (id: string, kind: 'link' | 'wait') =>
    kind === 'wait' ? setIds(node, 'WAITS', node.waits.filter((x) => x !== id)) : setIds(node, 'LINKS', node.links.filter((x) => x !== id))

  // Where a step can move to: any heading of this domain that isn't it or inside it, or the top level.
  const moveOptions = useMemo(() => {
    if (!fronts || !panel || panel.kind !== 'move') return []
    const moving = rows.find((r) => r.node.id === panel.id)?.node
    const out: PickOption[] = [{ id: null, label: 'Top level: its own project', detail: 'beside the other fronts' }]
    const walk = (n: ChainNode, path: string[]) => {
      if (moving && contains(moving, n.id)) return
      if (!n.done) out.push({ id: n.id, label: n.title, detail: path.join(' › ') || 'front' })
      n.children.forEach((c) => walk(c, [...path, n.title]))
    }
    fronts.forEach((f) => walk(f, []))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fronts, panel])

  const panelFor = (row: RowInfo) => {
    if (!panel || panel.id !== row.node.id) return null
    const close = () => setPanel(null)
    if (panel.kind === 'move') {
      return (
        <Picker options={moveOptions} placeholder="Move it under…" onClose={close}
          onPick={(o) => { close(); void run({ op: 'move', id: row.node.id, parent: o.id, index: 100000 }) }} />
      )
    }
    const n = row.node
    return (
      <Picker
        options={index ? linkOptions(index, new Set([n.id, ...n.links, ...n.waits]), domainTitles) : []}
        placeholder="Link it to… (any step, project or front, in any domain)"
        onClose={close}
        footer={
          <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={waits} onChange={(e) => setWaits(e.target.checked)} />
            It waits for that one: keep it off the Next list until that is done
          </label>
        }
        onPick={(o) => {
          close()
          if (!o.id) return
          if (waits) setIds(n, 'WAITS', [...n.waits, o.id])
          else setIds(n, 'LINKS', [...n.links, o.id])
        }}
      />
    )
  }

  const act = (row: RowInfo, a: Action) => {
    if (a === 'link' || a === 'move') {
      setWaits(false)
      setPanel((p) => (p?.id === row.node.id && p.kind === a ? null : { id: row.node.id, kind: a }))
    } else if (a === 'after') setAdding({ anchor: row.node.id, place: 'after', depth: row.depth })
    else if (a === 'first') setAdding({ anchor: row.node.id, place: 'first', depth: row.depth + 1 })
    else if (a === 'order') void run({ op: 'set', id: row.node.id, field: 'ORDERED', value: row.node.ordered ? 'nil' : 't' })
    else if (window.confirm(`Delete "${row.node.title}"${row.node.children.length ? ' and everything under it' : ''}? It goes to the Trash, at the foot of Outline, where you can restore it.`)) {
      void run({ op: 'delete', id: row.node.id })
    }
  }

  const add = async (title: string) => {
    if (!adding) return
    const id = await run({ op: 'add', anchor: adding.anchor, place: adding.place, title })
    // Keep typing: the next Enter adds the step after this one.
    if (id) setAdding({ anchor: id, place: 'after', depth: adding.place === 'last' ? 0 : adding.depth })
  }

  // Where the input goes: after its anchor, past the anchor's visible children for "after".
  const inputAfter = (() => {
    if (!adding || adding.place === 'last') return null
    const i = rows.findIndex((r) => r.node.id === adding.anchor)
    if (i < 0) return null
    if (adding.place === 'first') return i
    let j = i
    while (j + 1 < rows.length && rows[j + 1].depth > rows[i].depth) j++
    return j
  })()

  const input = adding && (
    <AddInput
      key={`${adding.anchor}-${adding.place}`}
      depth={adding.depth}
      placeholder={adding.place === 'first' ? 'A smaller first step' : 'The step after that'}
      onAdd={add}
      onClose={() => setAdding(null)}
    />
  )

  return (
    <div>
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-800">{error}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.node.id)} strategy={verticalListSortingStrategy}>
          <ul>
            {rows.map((row, i) => (
              <RowWithInput key={row.node.id} showInput={inputAfter === i} input={input}>
                <Row
                  row={row}
                  isNext={nextIds.has(row.node.id)}
                  needsStep={needsIds.has(row.node.id)}
                  selected={selected === row.node.id}
                  onSelect={() => setSelected((s) => (s === row.node.id ? null : row.node.id))}
                  onToggle={() => void run({ op: 'set', id: row.node.id, field: 'todo', value: row.node.done ? 'TODO' : 'DONE' })}
                  onRename={(t) => void run({ op: 'set', id: row.node.id, field: 'title', value: t })}
                  onAction={(a) => act(row, a)}
                  domain={domain}
                  index={index}
                  canMove={!!fronts}
                  onJump={onJump}
                  onUnlink={unlink(row.node)}
                  panel={panelFor(row)}
                />
              </RowWithInput>
            ))}
            {adding?.place === 'last' && input}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <button className="text-xs text-sky-800 hover:underline" onClick={() => setAdding({ anchor: front.id, place: 'last', depth: 0 })}>
          {wholeFile ? '+ Task or project' : '+ Step or project'}
        </button>
        {done > 0 && (
          <button className="text-xs text-gray-500 hover:underline" onClick={() => setShowDone((s) => !s)}>
            {showDone ? 'Hide done' : `Show ${done} done`}
          </button>
        )}
      </div>
    </div>
  )
}

function RowWithInput({ children, showInput, input }: { children: React.ReactNode; showInput: boolean; input: React.ReactNode }) {
  return (
    <>
      {children}
      {showInput && input}
    </>
  )
}
