'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api, message } from '@/components/chains/NextList'
import type { MoneyLink } from '@/lib/dough/links'

const pill = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm'
const field = 'min-w-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function EditRow({ link, first, last, onChanged, onError }: {
  link: MoneyLink; first: boolean; last: boolean; onChanged: () => Promise<void>; onError: (e: string | null) => void
}) {
  const [label, setLabel] = useState(link.label)
  const [url, setUrl] = useState(link.url)
  const dirty = label !== link.label || url !== link.url
  const run = async (work: () => Promise<unknown>) => {
    onError(null)
    try {
      await work()
      await onChanged()
    } catch (err) {
      onError(message(err))
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input className={`${field} w-32`} aria-label="Name" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className={`${field} flex-1 basis-48`} aria-label="Address" value={url} onChange={(e) => setUrl(e.target.value)} />
      <span className="flex gap-2 text-xs">
        <button className="text-gray-500 disabled:opacity-30" disabled={first} aria-label="Move left" onClick={() => run(() => api(`/api/dough/links/${link.id}`, 'PATCH', { move: -1 }))}>←</button>
        <button className="text-gray-500 disabled:opacity-30" disabled={last} aria-label="Move right" onClick={() => run(() => api(`/api/dough/links/${link.id}`, 'PATCH', { move: 1 }))}>→</button>
        {dirty && <button className="text-sky-800 hover:underline" onClick={() => run(() => api(`/api/dough/links/${link.id}`, 'PATCH', { label, url }))}>Save</button>}
        <button
          className="text-red-700 hover:underline"
          onClick={() => window.confirm(`Remove ${link.label}?`) && run(() => api(`/api/dough/links/${link.id}`, 'DELETE'))}
        >
          Remove
        </button>
      </span>
    </li>
  )
}

/** Your bank sites, plus Banki and Bokki, along the top of Dough. */
export default function MoneyLinks({ links, onChanged }: { links: MoneyLink[]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api('/api/dough/links', 'POST', { label, url })
      setLabel('')
      setUrl('')
      await onChanged()
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/banki" className={`${pill} border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-400`}>
          <span aria-hidden>$</span> Banki
        </Link>
        <Link href="/bokki" className={`${pill} border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400`}>
          <span aria-hidden>📒</span> Bokki
        </Link>
        {links.length > 0 && <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />}
        {links.map((l) => (
          <a
            key={l.id}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={hostOf(l.url)}
            className={`${pill} border-gray-200 bg-white text-gray-800 hover:border-sky-500 hover:text-sky-800`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600" aria-hidden>
              {l.label.slice(0, 1).toUpperCase()}
            </span>
            {l.label}
            <span className="text-xs text-gray-400" aria-hidden>↗</span>
          </a>
        ))}
        <button className="text-xs text-gray-500 hover:text-sky-800" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : links.length ? 'Edit links' : '+ Add your bank sites'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <ul className="space-y-2">
            {links.map((l, i) => (
              <EditRow key={`${l.id}-${l.label}-${l.url}`} link={l} first={i === 0} last={i === links.length - 1} onChanged={onChanged} onError={setError} />
            ))}
          </ul>
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={add}>
            <input className={`${field} w-32`} placeholder="Name" value={label} onChange={(e) => setLabel(e.target.value)} />
            <input className={`${field} flex-1 basis-48`} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800">Add</button>
          </form>
          <p className="mt-2 text-xs text-gray-500">Links open in a new tab. Only https addresses are accepted. Check each one goes to your bank&apos;s real site before you log in through it.</p>
          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      )}
    </section>
  )
}
