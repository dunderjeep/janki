'use client'

/**
 * Docs in Next: a project's documents, and the ones made from a task, written
 * in Scatterbrain's own editor (it saves as you type, keeps snapshots, and
 * stops rather than overwrite a change made elsewhere). Each doc is an item in
 * the project's Scatterbrain work, so it is there in Scatterbrain as well.
 */
import { useCallback, useEffect, useState } from 'react'
import EditorPane from '@/app/scatterbrain/EditorPane'
import type { Actions } from '@/app/scatterbrain/Workspace'
import type { ItemView } from '@/lib/scatterbrain/types'
import type { DocInfo } from '@/lib/chains/docs'
import { api, message } from './NextList'

const asItem = (d: DocInfo): ItemView => ({
  id: d.id, parentId: null, kind: 'note', title: d.title, synopsis: '', notes: '', status: 'draft', orgPath: null,
  povCharacterId: null, wordCount: d.words, targetWords: null, position: 0, characterIds: [],
})

/** Scatterbrain opens a work at its last-opened item, so say which one first. */
async function openInScatterbrain(d: DocInfo) {
  await fetch(`/api/scatterbrain/works/${d.workId}/opened`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: d.id }),
  }).catch(() => {})
  window.location.href = `/scatterbrain/${d.workId}`
}

/** One doc open to write in, over the page. Closing it keeps everything: it has already saved. */
export function DocEditor({ doc, onClose }: { doc: DocInfo; onClose: () => void }) {
  const [words, setWords] = useState(doc.words)
  const [note, setNote] = useState('')
  const actions: Actions = {
    refresh: async () => {},
    note: setNote,
    addItem: async () => {},
    move: async () => {},
    patchItem: (_id, patch) => { if (typeof patch.wordCount === 'number') setWords(patch.wordCount) },
    setSessionWords: () => {},
    select: () => {},
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={doc.title} className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{doc.title}</h2>
        <button className="text-xs text-sky-800 hover:underline" onClick={() => void openInScatterbrain(doc)}>Open in Scatterbrain</button>
        <button className="rounded-md border border-gray-200 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50" onClick={onClose}>Done</button>
      </div>
      {note && <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-900">{note}</p>}
      <div className="min-h-0 flex-1">
        <EditorPane item={asItem(doc)} words={words} actions={actions} />
      </div>
    </div>
  )
}

function DocList({ docs, onOpen, onUnlist }: { docs: DocInfo[]; onOpen: (d: DocInfo) => void; onUnlist?: (d: DocInfo) => void }) {
  if (!docs.length) return null
  return (
    <ul className="space-y-1">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-2 text-sm">
          <button className="min-w-0 truncate text-left text-sky-800 hover:underline" onClick={() => onOpen(d)}>📄 {d.title}</button>
          <span className="shrink-0 text-xs text-gray-400">{d.words.toLocaleString()} words</span>
          {onUnlist && <button className="shrink-0 text-xs text-gray-400 hover:text-gray-700" title="Take it off this task (it stays in the project)" onClick={() => onUnlist(d)}>×</button>}
        </li>
      ))}
    </ul>
  )
}

function NewDoc({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form className="flex gap-1.5" onSubmit={async (e) => {
      e.preventDefault()
      if (!title.trim() || busy) return
      setBusy(true)
      setError('')
      try {
        await onCreate(title.trim())
        setTitle('')
      } catch (err) {
        setError(message(err))
      } finally {
        setBusy(false)
      }
    }}>
      <input className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1 text-sm" placeholder="+ New doc: its name" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button disabled={busy || !title.trim()} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:border-sky-500 disabled:opacity-50">{busy ? '…' : 'Create'}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  )
}

/** A project's docs, and a box to start a new one, which opens straight away to write in. */
export function ProjectDocs({ place, project }: { place: string; project: string }) {
  const [docs, setDocs] = useState<DocInfo[] | null>(null)
  const [open, setOpen] = useState<DocInfo | null>(null)
  const reload = useCallback(async () => {
    const r = await api<{ docs: DocInfo[] }>(`/api/gtd/docs?place=${place}&project=${encodeURIComponent(project)}`)
    setDocs(r.docs)
    return r.docs
  }, [place, project])
  useEffect(() => { void reload() }, [reload])
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Docs</p>
      <DocList docs={docs ?? []} onOpen={setOpen} />
      <NewDoc onCreate={async (title) => {
        const made = await api<{ id: string }>('/api/gtd/docs', 'POST', { place, project, title })
        const all = await reload()
        setOpen(all.find((d) => d.id === made.id) ?? null)
      }} />
      {open && <DocEditor doc={open} onClose={() => { setOpen(null); void reload() }} />}
    </div>
  )
}

/** The docs made from a task (they live in its project), and a box to make one. */
export function TaskDocs({ place, project, task }: { place: string; project: string; task: string }) {
  const [docs, setDocs] = useState<DocInfo[]>([])
  const [open, setOpen] = useState<DocInfo | null>(null)
  const reload = useCallback(async () => {
    const r = await api<{ docs: DocInfo[] }>(`/api/gtd/docs?place=${place}&task=${encodeURIComponent(task)}`)
    setDocs(r.docs)
    return r.docs
  }, [place, task])
  useEffect(() => { void reload() }, [reload])
  return (
    <div className="space-y-1">
      <DocList docs={docs} onOpen={setOpen} onUnlist={async (d) => { await api('/api/gtd/docs', 'DELETE', { place, task, doc: d.id }); await reload() }} />
      <NewDoc onCreate={async (title) => {
        const made = await api<{ id: string }>('/api/gtd/docs', 'POST', { place, project, task, title })
        const all = await reload()
        setOpen(all.find((d) => d.id === made.id) ?? null)
      }} />
      {open && <DocEditor doc={open} onClose={() => { setOpen(null); void reload() }} />}
    </div>
  )
}
