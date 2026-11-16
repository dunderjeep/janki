'use client'

import { useEffect, useState } from 'react'
import type { Fact } from '../lib/chat'
import { api, inputClass, message, primaryClass, shortDate } from './ui'

function FactRow({ fact, onSaved, onDelete }: { fact: Fact; onSaved: (f: Fact) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(fact.text)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    try {
      onSaved(await api<Fact>(`/api/joblowski/facts/${fact.id}`, 'PATCH', { text }))
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }
  return (
    <li className="py-2">
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea className={`${inputClass} min-h-[3rem]`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="flex shrink-0 gap-2">
            <button className={primaryClass} onClick={save}>Save</button>
            <button className="text-sm text-gray-500" onClick={() => { setText(fact.text); setEditing(false) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-900 break-words">{fact.text}</p>
          <span className="flex shrink-0 gap-3 text-sm">
            <span className="hidden text-xs text-gray-400 sm:inline">{shortDate(fact.createdAt)}</span>
            <button className="text-sky-800 hover:underline" onClick={() => setEditing(true)}>Edit</button>
            <button className="text-red-700 hover:underline" onClick={onDelete}>Delete</button>
          </span>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  )
}

/**
 * What you have told Joblowski about yourself beyond your résumé. Claude may use
 * these in any draft, and the honesty check counts them as your own material.
 */
export default function FactsTab() {
  const [facts, setFacts] = useState<Fact[] | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ facts: Fact[] }>('/api/joblowski/facts').then((r) => setFacts(r.facts)).catch((err) => setError(message(err)))
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try {
      const fact = await api<Fact>('/api/joblowski/facts', 'POST', { text })
      setFacts((all) => [...(all ?? []), fact])
      setText('')
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }

  const remove = async (fact: Fact) => {
    if (!window.confirm('Delete this fact? Drafts will stop drawing on it.')) return
    try {
      await api(`/api/joblowski/facts/${fact.id}`, 'DELETE')
      setFacts((all) => (all ?? []).filter((f) => f.id !== fact.id))
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-600">
        Things about you that are true but not in your résumé: a tool you used, a project, a number you can stand behind.
        Claude may use these in any draft, and they stop it being flagged as made up. Answer a review note in a draft&apos;s chat and Claude offers to save what you said here.
      </p>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={add}>
        <input
          className={inputClass}
          placeholder="e.g. Built internal reporting dashboards with Flask at Evenica"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={`${primaryClass} shrink-0`}>Add fact</button>
      </form>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {facts === null ? (
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      ) : facts.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No facts yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {facts.map((f) => (
            <FactRow
              key={f.id}
              fact={f}
              onSaved={(next) => setFacts((all) => (all ?? []).map((x) => (x.id === next.id ? next : x)))}
              onDelete={() => remove(f)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
