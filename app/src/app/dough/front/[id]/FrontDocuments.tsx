'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, message } from '@/components/chains/NextList'
import type { FrontDocument } from '@/lib/dough/frontFiles'

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Files kept with a front: registrations, contracts, certificates, scans. */
export default function FrontDocuments({ frontId }: { frontId: string }) {
  const [docs, setDocs] = useState<FrontDocument[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setDocs((await api<{ documents: FrontDocument[] }>(`/api/dough/fronts/${frontId}/documents`)).documents)
    } catch (err) {
      setError(message(err))
    }
  }, [frontId])
  useEffect(() => void load(), [load])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    for (const f of Array.from(files)) form.append('file', f)
    form.append('note', note)
    try {
      const res = await fetch(`/api/dough/fronts/${frontId}/documents`, { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`)
      setDocs(json.documents)
      setNote('')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async (d: FrontDocument) => {
    if (!confirm(`Delete ${d.filename}? This can't be undone.`)) return
    try {
      await api(`/api/dough/documents/${d.id}`, 'DELETE')
      await load()
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-dashed border-gray-300 bg-white p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void upload(e.dataTransfer.files)
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-0 flex-1 basis-56 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Note for the next file (optional), e.g. Brreg approval"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            disabled={busy}
            className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800 disabled:opacity-50"
            onClick={() => input.current?.click()}
          >
            {busy ? 'Uploading…' : 'Attach files'}
          </button>
          <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </div>
        <p className="mt-2 text-xs text-gray-500">Or drop files here. PDFs, images, office and text files up to 25 MB. Kept private to you.</p>
      </div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      {docs === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-500">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <a className="min-w-0 break-all text-sky-800 hover:underline" href={`/api/dough/documents/${d.id}`} target="_blank" rel="noopener">
                {d.filename}
              </a>
              {d.note && <span className="text-gray-600">{d.note}</span>}
              <span className="ml-auto flex items-baseline gap-3 text-xs text-gray-500">
                {d.createdAt} · {size(d.sizeBytes)}
                <a className="hover:text-sky-800" href={`/api/dough/documents/${d.id}?download=1`}>Download</a>
                <button className="hover:text-red-700" onClick={() => void remove(d)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
