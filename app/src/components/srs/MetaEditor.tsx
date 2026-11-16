'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * A title and description, editable in place. ✎ swaps the heading for inputs;
 * Save PATCHes { name, description } to `endpoint`, Escape or Cancel puts it back.
 * Used for both decks and topics.
 */
export function MetaEditor({
  endpoint,
  initialName,
  initialDescription,
  namePlaceholder = 'Name',
  descriptionPlaceholder = 'Description — what this covers',
  leading,
}: {
  /** PATCH target, e.g. /api/srs/decks/abc */
  endpoint: string
  initialName: string
  initialDescription: string
  namePlaceholder?: string
  descriptionPlaceholder?: string
  /** Rendered before the title — a topic's colour dot, say. */
  leading?: React.ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName]       = useState(initialName)
  const [desc, setDesc]       = useState(initialDescription)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Props change when the server sends fresh values after a save; adopt them so
  // the heading never shows a stale name while the refresh lands.
  useEffect(() => {
    setName(initialName)
    setDesc(initialDescription)
  }, [initialName, initialDescription])

  function cancel() {
    setName(initialName)
    setDesc(initialDescription)
    setError(null)
    setEditing(false)
  }

  async function save() {
    if (!name.trim()) { setError('A name is required.'); return }
    setSaving(true)
    setError(null)
    const res = await fetch(endpoint, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), description: desc.trim() }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Save failed')
      return
    }
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="min-w-0 w-full">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          placeholder={namePlaceholder}
          className="w-full text-2xl font-bold text-gray-900 border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancel() }}
          rows={3}
          placeholder={descriptionPlaceholder}
          className="w-full mt-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={save}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <span className="text-xs text-gray-400">Enter saves the name · Esc cancels</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 w-full group">
      <div className="flex items-center gap-2 min-w-0">
        {leading}
        <button
          onClick={() => setEditing(true)}
          className="min-w-0 flex items-center gap-2 text-left -mx-1.5 px-1.5 py-0.5 rounded-lg hover:bg-gray-50 transition-colors"
          title="Click to rename"
        >
          <h1 className="text-2xl font-bold text-gray-900 truncate">{name}</h1>
          <span className="shrink-0 text-sm text-gray-300 group-hover:text-blue-600 transition-colors">✎</span>
        </button>
      </div>
      {desc ? (
        <p className="text-gray-500 mt-1 text-sm">{desc}</p>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-gray-400 hover:text-gray-600 italic mt-1 transition-colors"
        >
          + add a description
        </button>
      )}
    </div>
  )
}
