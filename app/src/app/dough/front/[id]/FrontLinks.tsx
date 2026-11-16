'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, message } from '@/components/chains/NextList'
import type { FrontLink } from '@/lib/dough/frontFiles'

/** Where a front's signal is kept in janki, shown without having to add it. */
const BUILT_IN: Record<string, { label: string; url: string }[]> = {
  bokki: [
    { label: 'Bokki: the books', url: '/bokki' }, { label: 'New voucher', url: '/bokki/ny' },
    { label: 'NutriLabel: nutrition facts and labels', url: '/nutrilabel' },
  ],
  joblowski: [{ label: 'Joblowski', url: '/joblowski' }],
}

function Item({ label, url, onDelete }: { label: string; url: string; onDelete?: () => void }) {
  const inside = url.startsWith('/')
  return (
    <li className="flex items-baseline gap-3 px-3 py-2 text-sm">
      {inside ? (
        <Link className="text-sky-800 hover:underline" href={url}>{label}</Link>
      ) : (
        <a className="text-sky-800 hover:underline" href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>
      )}
      <span className="min-w-0 truncate text-xs text-gray-400">{inside ? `janki ${url}` : url.replace(/^https:\/\/(www\.)?/, '')}</span>
      {onDelete ? (
        <button className="ml-auto text-xs text-gray-400 hover:text-red-700" onClick={onDelete}>Remove</button>
      ) : (
        <span className="ml-auto text-xs text-gray-300">built in</span>
      )}
    </li>
  )
}

/** Links from a front to related places: pages in janki or sites on the web. */
export default function FrontLinks({ frontId, signal }: { frontId: string; signal: string | null }) {
  const [links, setLinks] = useState<FrontLink[] | null>(null)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLinks((await api<{ links: FrontLink[] }>(`/api/dough/fronts/${frontId}/links`)).links)
    } catch (err) {
      setError(message(err))
    }
  }, [frontId])
  useEffect(() => void load(), [load])

  const add = async () => {
    setError(null)
    try {
      await api(`/api/dough/fronts/${frontId}/links`, 'POST', { label, url })
      setLabel('')
      setUrl('')
      await load()
    } catch (err) {
      setError(message(err))
    }
  }
  const remove = async (id: string) => {
    try {
      await api(`/api/dough/front-links/${id}`, 'DELETE')
      await load()
    } catch (err) {
      setError(message(err))
    }
  }

  const builtIn = (signal && BUILT_IN[signal]) || []
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {builtIn.map((l) => <Item key={l.url} {...l} />)}
        {links?.map((l) => <Item key={l.id} label={l.label} url={l.url} onDelete={() => void remove(l.id)} />)}
        {links?.length === 0 && builtIn.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No links yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <input
          className="w-40 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 basis-56 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="https://… or a janki page like /bokki"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800">Add link</button>
      </form>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
    </div>
  )
}
