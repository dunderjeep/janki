'use client'

/**
 * The Outline's actions for one step, where it shows up in the Do list and on
 * the top card: rename, "+ then" (the step after it), break down (smaller
 * steps under it, one per line, which makes it a project), link, move and
 * delete. Each goes through the same chain ops the Outline uses.
 */
import { useMemo, useState } from 'react'
import { contains, type ChainIndex, type ChainNode, type NextAction } from '@/lib/chains/tree'
import { chainOp, message } from './NextList'
import { linkOptions, Picker, type PickOption } from './links'

type Mode = null | 'then' | 'down' | 'link' | 'move'

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

export function StepBar({ a, index, fronts, domainTitles, onRename, onChanged, onFlash }: {
  a: NextAction
  index?: ChainIndex
  /** This step's domain's fronts: turns on "Move to…". */
  fronts?: ChainNode[]
  domainTitles?: Record<string, string>
  /** Opens the title for editing. */
  onRename?: () => void
  onChanged: () => Promise<void> | void
  onFlash?: (text: string) => void
}) {
  const [mode, setMode] = useState<Mode>(null)
  const [text, setText] = useState('')
  const [waits, setWaits] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = a.id!

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true)
    setError('')
    try {
      const said = await work()
      setMode(null)
      setText('')
      if (said) onFlash?.(said)
      await onChanged()
    } catch (err) {
      setError(message(err))
      await Promise.resolve(onChanged()).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  /** Adds the lines in order: the first under (or after) the step, each next one after the one before. */
  const addSteps = (place: 'first' | 'after') => run(async () => {
    const steps = lines(text)
    if (!steps.length) return
    let anchor = id
    let where: 'first' | 'after' = place
    for (const title of steps) {
      const res = await chainOp(a.domain, { op: 'add', anchor, place: where, title })
      if (!res.id) break
      anchor = res.id
      where = 'after'
    }
    return place === 'first'
      ? `Broken down: ${a.title} is a project now, starting with "${steps[0]}"`
      : `Then: ${steps.join(', then ')}`
  })

  const moveOptions = useMemo(() => {
    if (mode !== 'move' || !fronts) return []
    const self = (function find(ns: ChainNode[]): ChainNode | null {
      for (const n of ns) { if (n.id === id) return n; const f = find(n.children); if (f) return f }
      return null
    })(fronts)
    const out: PickOption[] = [{ id: null, label: 'Top level: on its own', detail: 'beside the other projects' }]
    const walk = (n: ChainNode, path: string[]) => {
      if (self && contains(self, n.id)) return
      if (!n.done) out.push({ id: n.id, label: n.title, detail: path.join(' › ') || 'project' })
      n.children.forEach((c) => walk(c, [...path, n.title]))
    }
    fronts.forEach((f) => walk(f, []))
    return out
  }, [mode, fronts, id])

  const toggle = (m: Mode) => { setError(''); setText(''); setWaits(false); setMode((x) => (x === m ? null : m)) }
  const action = 'text-xs text-sky-800 hover:underline disabled:opacity-50'

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-x-3 gap-y-1" role="toolbar" aria-label={`Actions for ${a.title}`}>
        {onRename && <button className={action} onClick={onRename}>Rename</button>}
        <button className={action} disabled={busy} aria-pressed={mode === 'then'} onClick={() => toggle('then')}>+ then</button>
        <button className={action} disabled={busy} aria-pressed={mode === 'down'} onClick={() => toggle('down')}
          title="Smaller steps under it: that makes it a project">Break down</button>
        {index && <button className={action} disabled={busy} aria-pressed={mode === 'link'} onClick={() => toggle('link')}>Link…</button>}
        {fronts && <button className={action} disabled={busy} aria-pressed={mode === 'move'} onClick={() => toggle('move')}>Move to…</button>}
        <button className="text-xs text-red-700 hover:underline disabled:opacity-50" disabled={busy} onClick={() => {
          if (window.confirm(`Delete "${a.title}"? It goes to the Trash, at the foot of Outline, where you can restore it.`)) {
            void run(async () => { await chainOp(a.domain, { op: 'delete', id }); return `Deleted: ${a.title} (it is in the Trash)` })
          }
        }}>Delete</button>
      </div>

      {(mode === 'then' || mode === 'down') && (
        <form className="mt-1.5" onSubmit={(e) => { e.preventDefault(); void addSteps(mode === 'down' ? 'first' : 'after') }}>
          <textarea autoFocus rows={mode === 'down' ? 3 : 1} value={text} onChange={(e) => setText(e.target.value)}
            aria-label={mode === 'down' ? 'Smaller steps' : 'The step after it'}
            placeholder={mode === 'down' ? 'Smaller steps, one per line, in order' : 'The step after it'}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMode(null)
              // Enter adds; Shift+Enter starts another line when breaking down.
              if (e.key === 'Enter' && !(e.shiftKey && mode === 'down')) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
            }}
            className="w-full resize-y rounded-md border border-sky-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <div className="mt-1 flex items-center gap-3">
            <button disabled={busy || !lines(text).length} className="rounded-md bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
              {busy ? 'Adding…' : mode === 'down' ? `Add ${lines(text).length > 1 ? `${lines(text).length} steps` : 'step'}` : 'Add'}
            </button>
            {mode === 'down' && <span className="text-[11px] text-gray-500">Shift+Enter for another line</span>}
            <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'link' && index && (
        <Picker
          options={linkOptions(index, new Set([id, ...a.links, ...a.waits]), domainTitles ?? {})}
          placeholder="Link it to… (any step, project or front, in any domain)"
          onClose={() => setMode(null)}
          footer={
            <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={waits} onChange={(e) => setWaits(e.target.checked)} />
              It waits for that one: keep it off the list until that is done
            </label>
          }
          onPick={(o) => {
            if (!o.id) return
            const field = waits ? 'WAITS' : 'LINKS'
            const ids = [...new Set([...(waits ? a.waits : a.links), o.id])]
            void run(async () => {
              await chainOp(a.domain, { op: 'set', id, field, value: ids.join(' ') })
              return waits ? `${a.title} now waits for ${o.label}` : `Linked: ${a.title} ↔ ${o.label}`
            })
          }}
        />
      )}

      {mode === 'move' && (
        <Picker options={moveOptions} placeholder="Move it under…" onClose={() => setMode(null)}
          onPick={(o) => void run(async () => {
            await chainOp(a.domain, { op: 'move', id, parent: o.id, index: 100000 })
            return `Moved: ${a.title} → ${o.id ? o.label : 'the top level'}`
          })} />
      )}

      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}
