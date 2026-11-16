'use client'

/**
 * Images come from Porcupin and go to Porcupin. A drop here is an ordinary
 * Porcupin upload into this work's project, then hung on whatever this zone
 * belongs to. Picking an existing pin skips straight to the second half.
 */
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { imageSrc, type PinView } from '@/lib/porcupin/types'
import type { AttachmentView } from '@/lib/scatterbrain/types'
import { api, jsonBody, readTransfer, uploadFile, uploadUrl, type UploadResult } from '../porcupin/intake'
import Field from './Field'
import type { Actions } from './Workspace'

type Target = { workId: string; itemId?: string; characterId?: string }

function PinPicker({ onPick, onClose }: { onPick: (pinId: string) => void; onClose: () => void }) {
  const [pins, setPins] = useState<PinView[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ pins: PinView[] }>('/api/scatterbrain/pins').then((r) => setPins(r.pins)).catch((e: Error) => setError(e.message))
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = !q ? pins ?? [] : (pins ?? []).filter((p) => `${p.title ?? ''} ${p.filename} ${p.description ?? ''}`.toLowerCase().includes(q))
    return hits.slice(0, 120)
  }, [pins, query])

  return (
    <div role="dialog" aria-modal="true" aria-label="Choose from Porcupin" onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[10vh]">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[75vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-200 p-3">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }} placeholder="Search Porcupin" aria-label="Search Porcupin" className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm" />
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {pins === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
          {pins !== null && shown.length === 0 && <p className="text-sm text-gray-500">No images match.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {shown.map((pin) => (
              <button key={pin.id} onClick={() => onPick(pin.id)} title={pin.title ?? pin.filename} className="group overflow-hidden rounded-md border border-gray-200 text-left hover:border-purple-400">
                <img src={imageSrc(pin.id, 'thumb')} alt={pin.title ?? pin.filename} loading="lazy" className="aspect-square w-full object-cover" />
                <span className="block truncate px-1 py-0.5 text-[11px] text-gray-600">{pin.title ?? pin.filename}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ImageDrop({ target, actions, prompt = 'Drop or paste images here' }: { target: Target; actions: Actions; prompt?: string }) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(0)
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const attach = (pinId: string) => api('/api/scatterbrain/attachments', jsonBody('POST', { ...target, pinId }))

  const receive = async (jobs: ((boardId: string) => Promise<UploadResult>)[]) => {
    if (jobs.length === 0) return
    setBusy((n) => n + jobs.length)
    try {
      const { boardId } = await api<{ boardId: string }>(`/api/scatterbrain/works/${target.workId}/board`, { method: 'POST' })
      const failures: string[] = []
      for (const job of jobs) {
        try {
          const { pin } = await job(boardId)
          await attach(pin.id)
        } catch (err) {
          failures.push((err as Error).message)
        } finally {
          setBusy((n) => n - 1)
        }
      }
      await actions.refresh()
      if (failures.length) actions.note(`Could not add ${failures.length === 1 ? 'that image' : `${failures.length} images`}: ${failures[0]}`)
    } catch (err) {
      setBusy(0)
      actions.note((err as Error).message)
    }
  }

  const take = (data: DataTransfer) => {
    const { files, urls, source, rejected } = readTransfer(data)
    if (rejected > 0) actions.note(`${rejected} skipped: only images can be added.`)
    void receive([
      ...files.map((f) => (boardId: string) => uploadFile(f, boardId, source)),
      ...urls.map((u) => (boardId: string) => uploadUrl(u, boardId)),
    ])
  }

  const pick = async (pinId: string) => {
    setPicking(false)
    try {
      await attach(pinId)
      await actions.refresh()
    } catch (err) {
      actions.note((err as Error).message)
    }
  }

  return (
    <div>
      <div
        tabIndex={0}
        aria-label={prompt}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer) }}
        onPaste={(e) => { e.preventDefault(); take(e.clipboardData) }}
        className={`rounded-lg border-2 border-dashed p-3 text-center text-xs focus:border-purple-400 focus:outline-none ${over ? 'border-purple-500 bg-purple-50 text-purple-800' : 'border-gray-300 text-gray-500'}`}
      >
        {busy > 0 ? `Adding ${busy}…` : prompt}
        <div className="mt-1.5 flex justify-center gap-2">
          <button onClick={() => input.current?.click()} className="rounded border border-gray-200 bg-white px-2 py-0.5 text-gray-700 hover:border-purple-300">Choose file</button>
          <button onClick={() => setPicking(true)} className="rounded border border-gray-200 bg-white px-2 py-0.5 text-gray-700 hover:border-purple-300">From Porcupin</button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            void receive(files.map((f) => (boardId: string) => uploadFile(f, boardId, null)))
          }}
        />
      </div>
      {picking && <PinPicker onPick={pick} onClose={() => setPicking(false)} />}
    </div>
  )
}

export function AttachmentList({ attachments, actions, extra }: {
  attachments: AttachmentView[]
  actions: Actions
  extra?: (attachment: AttachmentView, index: number) => React.ReactNode
}) {
  const remove = async (id: string) => {
    await api(`/api/scatterbrain/attachments/${id}`, { method: 'DELETE' })
    await actions.refresh()
  }

  return (
    <ul className="mt-3 space-y-3">
      {attachments.map((a, index) => (
        <li key={a.id} className="rounded-lg border border-gray-200 p-2">
          <Link href={`/porcupin?pin=${encodeURIComponent(a.pinId)}`} title="Open in Porcupin">
            <img src={imageSrc(a.pinId, 'thumb')} alt={a.caption || a.title || a.filename} loading="lazy" className="max-h-56 w-full rounded object-contain" />
          </Link>
          <div className="mt-1 truncate text-xs font-medium text-gray-700">{a.title ?? a.filename}</div>
          {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-purple-700 hover:underline">{a.sourceUrl}</a>}
          <Field
            key={a.id}
            label="Caption"
            value={a.caption}
            className="mt-1"
            onSave={(caption) => void api(`/api/scatterbrain/attachments/${a.id}`, jsonBody('PATCH', { caption })).catch((e: Error) => actions.note(e.message))}
          />
          <div className="mt-1.5 flex gap-3 text-xs">
            {extra?.(a, index)}
            <button onClick={() => void remove(a.id)} className="text-gray-500 hover:text-red-700">Remove</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
