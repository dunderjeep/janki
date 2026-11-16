'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  KIND_LABEL, parseWordTarget, STATUS_LABEL, WORK_KINDS,
  type ItemKind, type ItemStatus, type ItemView, type SnapshotView, type WorkBundle,
} from '@/lib/scatterbrain/types'
import { api, jsonBody } from '../porcupin/intake'
import Field from './Field'
import { AttachmentList, ImageDrop } from './Images'
import type { Actions } from './Workspace'

type Tab = 'notes' | 'images' | 'cast' | 'history' | 'work'

const TABS: { id: Tab; label: string; needsItem: boolean }[] = [
  { id: 'notes', label: 'Notes', needsItem: true },
  { id: 'images', label: 'Images', needsItem: true },
  { id: 'cast', label: 'Cast', needsItem: true },
  { id: 'history', label: 'History', needsItem: true },
  { id: 'work', label: 'Work', needsItem: false },
]

const select = 'mt-1 block w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-normal text-gray-900'

export default function Inspector({ bundle, item, actions, onReloadEditor, onDeleted }: {
  bundle: WorkBundle
  item: ItemView | null
  actions: Actions
  onReloadEditor: () => void
  onDeleted: () => void
}) {
  const [tab, setTab] = useState<Tab>('notes')
  const current = item ? tab : 'work'

  const saveItem = (patch: Partial<ItemView>) => {
    if (!item) return
    actions.patchItem(item.id, patch)
    void api(`/api/scatterbrain/items/${item.id}`, jsonBody('PATCH', patch)).catch((e: Error) => actions.note(e.message))
  }

  return (
    <aside aria-label="Inspector" className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-gray-50">
      <div role="tablist" aria-label="Inspector sections" className="flex border-b border-gray-200 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            disabled={t.needsItem && !item}
            onClick={() => setTab(t.id)}
            className={`flex-1 border-b-2 px-1 py-2 text-xs ${current === t.id ? 'border-purple-600 font-medium text-purple-800' : 'border-transparent text-gray-600 hover:text-gray-900 disabled:text-gray-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {current === 'notes' && item && <NotesTab key={item.id} item={item} bundle={bundle} save={saveItem} actions={actions} onDeleted={onDeleted} />}
        {current === 'images' && item && (
          <div>
            <ImageDrop key={item.id} target={{ workId: bundle.work.id, itemId: item.id }} actions={actions} />
            <AttachmentList attachments={bundle.attachments.filter((a) => a.itemId === item.id)} actions={actions} />
          </div>
        )}
        {current === 'cast' && item && <CastTab item={item} bundle={bundle} save={saveItem} actions={actions} />}
        {current === 'history' && item && <HistoryTab key={item.id} item={item} actions={actions} onRestored={onReloadEditor} />}
        {current === 'work' && <WorkTab key={bundle.work.id} bundle={bundle} actions={actions} />}
      </div>
    </aside>
  )
}

function NotesTab({ item, bundle, save, actions, onDeleted }: {
  item: ItemView
  bundle: WorkBundle
  save: (patch: Partial<ItemView>) => void
  actions: Actions
  onDeleted: () => void
}) {
  const unlink = async () => {
    if (!confirm('Stop linking this to its org file? A copy of the text stays here, and the file is left as it is.')) return
    try {
      await api(`/api/scatterbrain/items/${item.id}`, jsonBody('PATCH', { orgPath: null }))
      await actions.refresh()
    } catch (e) {
      actions.note((e as Error).message)
    }
  }
  const remove = async () => {
    const also = bundle.items.some((i) => i.parentId === item.id) ? ' and everything inside it' : ''
    const file = item.orgPath ? ' The linked note itself stays.' : ''
    if (!confirm(`Delete “${item.title}”${also}?${file}`)) return
    try {
      await api(`/api/scatterbrain/items/${item.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (e) {
      actions.note((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Title" value={item.title} onSave={(title) => title.trim() && save({ title })} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-gray-600">
          Type
          <select className={select} value={item.kind} onChange={(e) => save({ kind: e.target.value as ItemKind })}>
            {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Status
          <select className={select} value={item.status} onChange={(e) => save({ status: e.target.value as ItemStatus })}>
            {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <Field label="Word target" placeholder="None" value={item.targetWords ? String(item.targetWords) : ''} onSave={(value) => save({ targetWords: parseWordTarget(value) })} />
      <Field label="Synopsis (shown on the pegboard card)" value={item.synopsis} multiline rows={3} onSave={(synopsis) => save({ synopsis })} />
      <Field label="Notes" value={item.notes} multiline rows={12} placeholder="Anything about this part of the writing" onSave={(notes) => save({ notes })} />

      {item.orgPath && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <div className="font-medium">Linked to a note</div>
          <div className="mt-0.5 break-all">{item.orgPath}</div>
          <div className="mt-1.5 flex gap-3">
            <button onClick={() => void unlink()} className="underline">Unlink</button>
          </div>
        </div>
      )}

      <button onClick={() => void remove()} className="text-xs text-gray-500 hover:text-red-700">Delete this {KIND_LABEL[item.kind].toLowerCase()}</button>
    </div>
  )
}

function CastTab({ item, bundle, save, actions }: { item: ItemView; bundle: WorkBundle; save: (patch: Partial<ItemView>) => void; actions: Actions }) {
  const [name, setName] = useState('')

  const toggle = (id: string) => {
    const has = item.characterIds.includes(id)
    save({ characterIds: has ? item.characterIds.filter((c) => c !== id) : [...item.characterIds, id] })
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const made = await api<{ id: string }>(`/api/scatterbrain/works/${bundle.work.id}/characters`, jsonBody('POST', { name }))
      await api(`/api/scatterbrain/items/${item.id}`, jsonBody('PATCH', { characterIds: [...item.characterIds, made.id] }))
      setName('')
      await actions.refresh()
    } catch (err) {
      actions.note((err as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-600">
        Point of view
        <select className={select} value={item.povCharacterId ?? ''} onChange={(e) => save({ povCharacterId: e.target.value || null })}>
          <option value="">None</option>
          {bundle.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <fieldset>
        <legend className="text-xs font-medium text-gray-600">Appearing here</legend>
        {bundle.characters.length === 0 && <p className="mt-1 text-xs text-gray-500">No characters yet.</p>}
        <ul className="mt-1 space-y-1">
          {bundle.characters.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={item.characterIds.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <form onSubmit={add} className="flex gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New character" aria-label="New character" className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm" />
        <button disabled={!name.trim()} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:opacity-40">Add</button>
      </form>
    </div>
  )
}

function HistoryTab({ item, actions, onRestored }: { item: ItemView; actions: Actions; onRestored: () => void }) {
  const [snapshots, setSnapshots] = useState<SnapshotView[] | null>(null)
  const [label, setLabel] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    api<SnapshotView[]>(`/api/scatterbrain/items/${item.id}/snapshots`).then(setSnapshots).catch((e: Error) => actions.note(e.message))
  }, [actions, item.id])

  useEffect(load, [load])

  const take = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api(`/api/scatterbrain/items/${item.id}/snapshots`, jsonBody('POST', { label }))
      setLabel('')
      load()
    } catch (err) {
      actions.note((err as Error).message)
    }
  }

  const restore = async (snapshot: SnapshotView) => {
    const when = new Date(snapshot.createdAt).toLocaleString()
    const where = item.orgPath ? ` This rewrites ${item.orgPath}.` : ''
    if (!confirm(`Go back to the version from ${when}? The current text is saved first, so this can be undone.${where}`)) return
    try {
      const res = await fetch(`/api/scatterbrain/snapshots/${snapshot.id}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Could not restore that version')
      onRestored()
      await actions.refresh()
      load()
    } catch (err) {
      actions.note((err as Error).message)
    }
  }

  return (
    <div>
      <p className="text-xs text-gray-500">Earlier versions are kept automatically as you write, at most one every ten minutes.</p>
      <form onSubmit={take} className="mt-2 flex gap-1">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this version" aria-label="Name this version" className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm" />
        <button className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700">Save</button>
      </form>
      {snapshots?.length === 0 && <p className="mt-3 text-xs text-gray-500">No earlier versions yet.</p>}
      <ul className="mt-3 space-y-2">
        {snapshots?.map((s) => (
          <li key={s.id} className="rounded-md border border-gray-200 bg-white p-2 text-xs">
            <div className="font-medium text-gray-800">{s.label || (s.kind === 'auto' ? 'Automatic' : 'Saved version')}</div>
            <div className="text-gray-500">{new Date(s.createdAt).toLocaleString()}</div>
            <div className="mt-1 flex gap-3">
              <button onClick={() => setOpen(open === s.id ? null : s.id)} className="text-purple-700 hover:underline">{open === s.id ? 'Hide' : 'Preview'}</button>
              <button onClick={() => void restore(s)} className="text-purple-700 hover:underline">Restore</button>
            </div>
            {open === s.id && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-gray-700">{s.preview}</pre>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkTab({ bundle, actions }: { bundle: WorkBundle; actions: Actions }) {
  const router = useRouter()
  const { work } = bundle
  const url = `/api/scatterbrain/works/${work.id}`

  const save = (patch: object, reload = false) =>
    api(url, jsonBody('PATCH', patch))
      .then(() => (reload ? actions.refresh() : undefined))
      .catch((e: Error) => actions.note(e.message))

  const remove = async () => {
    if (!confirm(`Delete “${work.title}” from Scatterbrain? Linked org files and Porcupin images are kept.`)) return
    try {
      await api(url, { method: 'DELETE' })
      router.push('/scatterbrain')
      router.refresh()
    } catch (e) {
      actions.note((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Title" value={work.title} onSave={(title) => title.trim() && void save({ title }, true)} />
      <Field label="Logline" value={work.logline} multiline rows={2} onSave={(logline) => void save({ logline })} />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-gray-600">
          Kind
          <select className={select} value={work.kind} onChange={(e) => void save({ kind: e.target.value }, true)}>
            {WORK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <Field label="Word target" value={work.targetWords ? String(work.targetWords) : ''} onSave={(value) => void save({ targetWords: parseWordTarget(value) }, true)} />
      </div>
      <Field label="Notes on the whole work" value={work.notes} multiline rows={8} onSave={(notes) => void save({ notes })} />

      <div>
        <div className="mb-1 text-xs font-medium text-gray-600">Cover and reference images</div>
        <ImageDrop target={{ workId: work.id }} actions={actions} prompt="Drop a cover or reference image" />
        <AttachmentList
          attachments={bundle.attachments.filter((a) => !a.itemId && !a.characterId)}
          actions={actions}
          extra={(a) => work.coverPinId === a.pinId
            ? <span className="font-medium text-purple-800">Cover</span>
            : <button onClick={() => void save({ coverPinId: a.pinId }, true)} className="text-purple-700 hover:underline">Use as cover</button>}
        />
      </div>

      <div className="flex flex-col items-start gap-2 border-t border-gray-200 pt-3 text-xs">
        <a href={`${url}/compile`} className="text-purple-700 hover:underline">Download the manuscript (Markdown)</a>
        {work.boardId && <Link href="/porcupin" className="text-purple-700 hover:underline">Open Porcupin</Link>}
        <button onClick={() => void remove()} className="text-gray-500 hover:text-red-700">Delete this work</button>
      </div>
    </div>
  )
}
