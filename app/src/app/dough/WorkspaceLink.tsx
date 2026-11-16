'use client'

import { useState } from 'react'
import { chainOp, message } from '@/components/chains/NextList'

/** Sets or changes the page a front is worked on in, such as its Google Sheet. */
export default function WorkspaceLink({ frontId, current, onChanged, label }: {
  frontId: string
  current: string | null
  onChanged: () => Promise<void>
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = async (value: string) => {
    setError(null)
    try {
      await chainOp('money', { op: 'set', id: frontId, field: 'WORKSPACE', value })
      setOpen(false)
      await onChanged()
    } catch (err) {
      setError(message(err))
    }
  }
  if (!open) return <button className="text-xs text-gray-500 hover:text-sky-800" onClick={() => setOpen(true)}>{label}</button>
  return (
    <form
      className="mt-2 flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save(url.trim())
      }}
    >
      <input
        autoFocus
        className="min-w-0 flex-1 basis-56 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        placeholder="https://docs.google.com/spreadsheets/d/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800">Save</button>
      {current && <button type="button" className="text-xs text-red-700" onClick={() => void save('')}>Remove</button>}
      <button type="button" className="text-xs text-gray-500" onClick={() => setOpen(false)}>Cancel</button>
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </form>
  )
}
