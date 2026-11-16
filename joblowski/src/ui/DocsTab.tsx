'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DocKind, DocSummary } from '../lib/types'
import { ago, api, inputClass, message, primaryClass, secondaryClass } from './ui'

const WORDS = {
  resume: { one: 'résumé', example: 'Data manager, museums', empty: 'Keep one version for each kind of job you apply for.' },
  letter: { one: 'cover letter', example: 'General, research institutions', empty: 'Write a base letter with {{company}}, {{role}} and {{date}}, then use Copy on a tracked job to fill them in, or Draft with Claude to write one for that job.' },
}

export default function DocsTab({ kind, documents, reload }: { kind: DocKind; documents: DocSummary[]; reload: () => Promise<void> }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const shown = documents.filter((d) => d.kind === kind)
  const words = WORDS[kind]

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await work()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { id } = await api<{ id: string }>('/api/joblowski/documents', 'POST', { kind, name })
      router.push(`/joblowski/docs/${id}`)
    })
  }

  const duplicate = (d: DocSummary) =>
    run(async () => {
      const { id } = await api<{ id: string }>('/api/joblowski/documents', 'POST', { fromId: d.id })
      router.push(`/joblowski/docs/${id}`)
    })

  const remove = (d: DocSummary) => {
    if (!window.confirm(`Delete "${d.name}"?`)) return
    void run(async () => {
      const { archived } = await api<{ archived: boolean }>(`/api/joblowski/documents/${d.id}`, 'DELETE')
      await reload()
      if (archived) setNote(`"${d.name}" is hidden, but the copies you sent are still on the applications that used them.`)
    })
  }

  return (
    <div>
      <form onSubmit={create} className="flex gap-2 mb-5 max-w-xl">
        <label className="flex-1">
          <span className="sr-only">Name of new {words.one}</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${words.one}, e.g. ${words.example}`} />
        </label>
        <button className={primaryClass} disabled={busy || !name.trim()}>Create</button>
      </form>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {note && <p className="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">{note}</p>}
      {shown.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-600">{words.empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-[14rem] flex-1">
                <Link href={`/joblowski/docs/${d.id}`} className="font-medium text-gray-900 hover:text-sky-800 hover:underline break-words">{d.name}</Link>
                <p className="text-xs text-gray-500">
                  Edited {ago(d.updatedAt)} · {d.versions} saved {d.versions === 1 ? 'version' : 'versions'} · used in {d.usedIn} {d.usedIn === 1 ? 'application' : 'applications'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a className={secondaryClass} href={`/api/joblowski/documents/${d.id}/pdf`}>PDF</a>
                <button className={secondaryClass} disabled={busy} onClick={() => duplicate(d)}>Duplicate</button>
                <button className="px-1 text-sm text-gray-500 hover:text-red-700" disabled={busy} onClick={() => remove(d)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
