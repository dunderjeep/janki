'use client'

/** A single work: binder on the left, the current view in the middle, inspector on the right. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isContainer, KIND_LABEL, type ItemKind, type ItemView, type WorkBundle } from '@/lib/scatterbrain/types'
import { api, jsonBody } from '../porcupin/intake'
import Binder from './Binder'
import Characters from './Characters'
import EditorPane from './EditorPane'
import Inspector from './Inspector'
import OrgPalette from './OrgPalette'
import Pegboard from './Pegboard'
import Targets from './Targets'

type View = 'write' | 'pegboard' | 'characters'

const VIEWS: { id: View; label: string }[] = [
  { id: 'write', label: 'Write' },
  { id: 'pegboard', label: 'Pegboard' },
  { id: 'characters', label: 'Characters' },
]

const remembered = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export type Actions = {
  refresh(): Promise<void>
  note(message: string): void
  addItem(parentId: string | null, kind: ItemKind): Promise<void>
  move(itemId: string, parentId: string | null, beforeId: string | null): Promise<void>
  patchItem(itemId: string, patch: Partial<ItemView>): void
  setSessionWords(words: number): void
  select(itemId: string): void
}

export default function Workspace({ initial }: { initial: WorkBundle }) {
  const router = useRouter()
  const [bundle, setBundle] = useState(initial)
  const { work, items } = bundle
  const storageKey = `scatterbrain:${work.id}`

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('write')
  const [focus, setFocus] = useState(false)
  const [palette, setPalette] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)

  const note = useCallback((text: string) => setMessage(text), [])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(timer)
  }, [message])

  const refresh = useCallback(async () => {
    setBundle(await api<WorkBundle>(`/api/scatterbrain/works/${work.id}`))
  }, [work.id])

  // Being really open, rather than prefetched, is what makes a work current.
  useEffect(() => {
    void fetch(`/api/scatterbrain/works/${work.id}/opened`, { method: 'POST' })
  }, [work.id])

  // Where you were. The server's record wins — it follows you across origins
  // (localhost vs the tailnet name have separate localStorage) and devices;
  // localStorage is only the fallback. Restored after mount: localStorage is
  // not there during the server render.
  useEffect(() => {
    const has = (id: string | null) => !!id && initial.items.some((i) => i.id === id)
    const local = remembered(`${storageKey}:item`)
    const saved = has(initial.work.lastItemId) ? initial.work.lastItemId : has(local) ? local : null
    const first = initial.items.find((i) => !isContainer(i.kind)) ?? initial.items[0]
    setSelectedId(saved ?? first?.id ?? null)
    const savedView = initial.work.lastView ?? remembered(`${storageKey}:view`)
    if (savedView === 'write' || savedView === 'pegboard' || savedView === 'characters') setView(savedView)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const recordPlace = useCallback((place: { itemId?: string; view?: View }) => {
    void fetch(`/api/scatterbrain/works/${work.id}/opened`, jsonBody('POST', place)).catch(() => {})
  }, [work.id])

  const select = useCallback((id: string) => {
    setSelectedId(id)
    remember(`${storageKey}:item`, id)
    recordPlace({ itemId: id })
  }, [storageKey, recordPlace])

  const changeView = useCallback((next: View) => {
    setView(next)
    remember(`${storageKey}:view`, next)
    recordPlace({ view: next })
  }, [storageKey, recordPlace])

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId])

  const guarded = useCallback(async (work_: () => Promise<void>) => {
    try {
      await work_()
    } catch (err) {
      setMessage((err as Error).message)
    }
  }, [])

  // Read through a ref so `actions` never changes identity: the editor's save
  // effect depends on it, and must not re-run because a word count updated.
  const itemsRef = useRef(items)
  itemsRef.current = items

  const actions: Actions = useMemo(() => ({
    refresh,
    note,
    select,
    patchItem(itemId, patch) {
      setBundle((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))
    },
    setSessionWords(sessionWords) {
      setBundle((b) => ({ ...b, work: { ...b.work, sessionWords } }))
    },
    addItem: (parentId, kind) => guarded(async () => {
      const siblings = itemsRef.current.filter((i) => i.parentId === parentId && i.kind === kind).length
      const title = `${KIND_LABEL[kind]} ${siblings + 1}`
      const { id } = await api<{ id: string }>(`/api/scatterbrain/works/${work.id}/items`, jsonBody('POST', { parentId, kind, title }))
      await refresh()
      select(id)
    }),
    move: (itemId, parentId, beforeId) => guarded(async () => {
      await api(`/api/scatterbrain/items/${itemId}/move`, jsonBody('POST', { parentId, beforeId }))
      await refresh()
    }),
  }), [guarded, note, refresh, select, work.id])

  // Where a note opened from the palette lands: inside the nearest act or chapter.
  const insertionParent = useMemo(() => {
    if (!selected) return null
    return isContainer(selected.kind) ? selected.id : selected.parentId
  }, [selected])

  const openOrgFile = async (path: string) => {
    setPalette(false)
    await guarded(async () => {
      const { id, created } = await api<{ id: string; created: boolean }>(
        `/api/scatterbrain/works/${work.id}/items`,
        jsonBody('POST', { orgPath: path, parentId: insertionParent, kind: 'scene' }),
      )
      await refresh()
      select(id)
      changeView('write')
      if (!created) note('That file is already in this work.')
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setPalette(true)
      } else if (e.key === 'Escape') setFocus(false)
    }
    // A file dropped outside a drop zone must not navigate the tab away from the draft.
    const stray = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('dragover', stray)
    window.addEventListener('drop', stray)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', stray)
      window.removeEventListener('drop', stray)
    }
  }, [])

  const total = items.filter((i) => i.kind !== 'note').reduce((sum, i) => sum + i.wordCount, 0)

  // A chapter's target is measured against everything inside it.
  const selectedWords = useMemo(() => {
    if (!selected) return 0
    const within = (id: string): number =>
      items.filter((i) => i.parentId === id).reduce((sum, kid) => sum + kid.wordCount + within(kid.id), 0)
    return selected.wordCount + within(selected.id)
  }, [items, selected])

  const [renamingWork, setRenamingWork] = useState(false)
  /** Renames the work from the bar; a project's docs work renames its project in Next too. */
  const renameWork = async (value: string) => {
    const title = value.replace(/[\r\n]+/g, ' ').trim()
    setRenamingWork(false)
    if (!title || title === work.title) return
    const res = await fetch(`/api/scatterbrain/works/${work.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    })
    if (!res.ok) { actions.note((await res.json().catch(() => ({}))).error ?? 'Could not rename it'); return }
    await refresh()
  }
  const showSides = !focus
  const showInspector = showSides && view !== 'characters'

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-2">
        <Link href="/scatterbrain" className="text-sm text-gray-500 hover:text-purple-700">All works</Link>
        {renamingWork ? (
          <input autoFocus defaultValue={work.title} aria-label="Work title"
            className="w-64 rounded-md border border-purple-400 bg-white px-2 py-1 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void renameWork(e.currentTarget.value) }
              if (e.key === 'Escape') setRenamingWork(false)
            }}
            onBlur={(e) => void renameWork(e.currentTarget.value)} />
        ) : (
          <span className="inline-flex items-center gap-1">
            <select
              aria-label="Switch work"
              value={work.id}
              onChange={(e) => router.push(`/scatterbrain/${e.target.value}`)}
              className="max-w-64 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900"
            >
              {bundle.works.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
            <button type="button" aria-label={`Rename ${work.title}`} title="Rename this work" onClick={() => setRenamingWork(true)}
              className="rounded px-1 text-gray-400 hover:text-purple-700">✎</button>
          </span>
        )}

        <div role="tablist" aria-label="View" className="flex rounded-lg bg-gray-100 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => changeView(v.id)}
              className={`rounded-md px-3 py-1 text-sm ${view === v.id ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button onClick={() => setPalette(true)} className="rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-purple-300 hover:text-purple-700">
          Open a note <kbd className="ml-1 text-[11px] text-gray-400">Ctrl+O</kbd>
        </button>

        <div className="ml-auto flex items-center gap-4">
          <Targets work={work} total={total} actions={actions} />
          <button onClick={() => setFocus((f) => !f)} aria-pressed={focus} className="rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-purple-300">
            {focus ? 'Show panels' : 'Focus'}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showSides && (
          <Binder items={items} selectedId={selectedId} attachments={bundle.attachments} actions={actions} />
        )}

        <div className="min-w-0 flex-1">
          {view === 'write' && (selected ? (
            <EditorPane
              key={`${selected.id}:${selected.orgPath ?? ''}:${editorVersion}`}
              item={selected}
              words={selectedWords}
              actions={actions}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
              Add a scene in the binder, or open a note, to start writing.
            </div>
          ))}
          {view === 'pegboard' && (
            <Pegboard
              items={items}
              characters={bundle.characters}
              attachments={bundle.attachments}
              selectedId={selectedId}
              actions={actions}
              onOpen={(id) => { select(id); changeView('write') }}
            />
          )}
          {view === 'characters' && (
            <Characters bundle={bundle} actions={actions} onOpenItem={(id) => { select(id); changeView('write') }} />
          )}
        </div>

        {showInspector && (
          <Inspector
            bundle={bundle}
            item={selected}
            actions={actions}
            onReloadEditor={() => setEditorVersion((v) => v + 1)}
            onDeleted={() => { setSelectedId(null); void refresh() }}
          />
        )}
      </div>

      {palette && <OrgPalette onPick={openOrgFile} onClose={() => setPalette(false)} />}

      {message && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </div>
      )}
    </div>
  )
}
