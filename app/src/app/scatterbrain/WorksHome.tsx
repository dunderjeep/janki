'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { imageSrc } from '@/lib/porcupin/types'
import { WORK_KINDS, type WorkSummary } from '@/lib/scatterbrain/types'
import { api, jsonBody } from '../porcupin/intake'

export default function WorksHome({ works }: { works: WorkSummary[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<string>('novel')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const { id } = await api<{ id: string }>('/api/scatterbrain/works', jsonBody('POST', { title, kind }))
      router.push(`/scatterbrain/${id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Scatterbrain</h1>
      <p className="mt-1 text-sm text-gray-500">Everything you are writing, or have half started.</p>

      <form onSubmit={create} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <label className="flex-1 min-w-52 text-xs font-medium text-gray-600">
          New work
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Working title"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            title={WORK_KINDS.find((k) => k.value === kind)?.hint}
            className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900"
          >
            {WORK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <button disabled={!title.trim() || busy} className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-40">
          {busy ? 'Creating…' : 'Create'}
        </button>
        {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
      </form>

      {works.length === 0 ? (
        <p className="mt-12 text-center text-sm text-gray-500">No works yet. Give the first one a working title above.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {works.map((work, i) => (
            <li key={work.id}>
              <Link href={`/scatterbrain/${work.id}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-br from-fuchsia-400 to-purple-700 shadow transition group-hover:shadow-lg">
                  {work.coverPinId
                    ? <img src={imageSrc(work.coverPinId, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : <span aria-hidden className="absolute inset-0 flex items-center justify-center text-5xl">🌀</span>}
                  {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-purple-800">Current</span>}
                </div>
                {work.lastItemTitle && work.lastItemTitle !== work.title ? (
                  <>
                    <div className="mt-2 text-sm font-medium text-gray-900">{work.lastItemTitle}</div>
                    <div className="text-xs text-gray-600">in {work.title}</div>
                  </>
                ) : (
                  <div className="mt-2 text-sm font-medium text-gray-900">{work.title}</div>
                )}
                <div className="text-xs text-gray-500">{WORK_KINDS.find((k) => k.value === work.kind)?.label ?? work.kind} · {work.wordCount.toLocaleString()}{work.targetWords ? ` / ${work.targetWords.toLocaleString()}` : ''} words</div>
                {work.targetWords ? (
                  <div role="progressbar" aria-label="Word target" aria-valuemin={0} aria-valuemax={work.targetWords} aria-valuenow={Math.min(work.wordCount, work.targetWords)} className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
                    <div className={`h-full ${work.wordCount >= work.targetWords ? 'bg-emerald-500' : 'bg-purple-600'}`} style={{ width: `${Math.min(100, (work.wordCount / work.targetWords) * 100)}%` }} />
                  </div>
                ) : null}
                {work.logline && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{work.logline}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
