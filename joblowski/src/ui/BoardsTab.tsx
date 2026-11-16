'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { boardUrl, groupBoards } from '../lib/boards'
import type { CustomBoard } from '../lib/types'
import { api, inputClass, message, primaryClass, secondaryClass } from './ui'

type Draft = { name: string; urlTemplate: string; section: string; note: string; quick: boolean }

const LINK_HINT = 'https://… (use {q} for the search and {l} for the place)'

function BoardForm({ initial, sections, submitLabel, onSubmit, onCancel }: {
  initial: Draft
  sections: string[]
  submitLabel: string
  onSubmit: (draft: Draft) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-sky-300 bg-sky-50/40 p-3 sm:grid-cols-[12rem_1fr]">
      <input className={inputClass} aria-label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Name" />
      <input className={inputClass} aria-label="Link" value={draft.urlTemplate} onChange={(e) => set('urlTemplate', e.target.value)} placeholder={LINK_HINT} />
      <input className={inputClass} aria-label="Section" list="joblowski-board-sections" value={draft.section} onChange={(e) => set('section', e.target.value)} placeholder="Section" />
      <input className={inputClass} aria-label="Note" value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="Note (optional), e.g. Universities and the public sector" />
      <datalist id="joblowski-board-sections">
        {sections.map((s) => <option key={s} value={s} />)}
      </datalist>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={draft.quick} onChange={(e) => set('quick', e.target.checked)} />
          Also offer under the search box on Search
        </label>
        <span className="flex-1" />
        {onCancel && <button type="button" className={secondaryClass} onClick={onCancel}>Cancel</button>}
        <button className={primaryClass} disabled={busy || !draft.name.trim() || !draft.urlTemplate.trim()}>{submitLabel}</button>
      </div>
    </form>
  )
}

export default function BoardsTab({ boards, setBoards }: {
  boards: CustomBoard[]
  setBoards: Dispatch<SetStateAction<CustomBoard[]>>
}) {
  const [q, setQ] = useState('')
  const [l, setL] = useState('Oslo')
  const [editing, setEditing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const groups = groupBoards(boards)
  const sections = groups.map((g) => g.title)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setNote(null)
    try {
      await fn()
    } catch (err) {
      setError(message(err))
    }
  }

  const add = (draft: Draft) => run(async () => {
    await api<CustomBoard>('/api/joblowski/boards', 'POST', draft)
    // The server may have shifted others to fit the new one into its section.
    setBoards((await api<{ boards: CustomBoard[] }>('/api/joblowski/boards')).boards)
    setAdding(false)
  })

  const save = (id: string, draft: Draft) => run(async () => {
    const board = await api<CustomBoard>(`/api/joblowski/boards/${id}`, 'PATCH', draft)
    const old = boards.find((b) => b.id === id)
    if (old && old.section !== board.section) {
      // A board moved to another section goes to that section's end.
      const rest = boards.filter((b) => b.id !== id)
      const lastIndex = rest.map((b) => b.section).lastIndexOf(board.section)
      rest.splice(lastIndex === -1 ? rest.length : lastIndex + 1, 0, board)
      setBoards(rest)
      await saveOrder(rest)
    } else {
      setBoards((all) => all.map((b) => (b.id === id ? board : b)))
    }
    setOpenId(null)
  })

  const remove = (b: CustomBoard) => run(async () => {
    if (!window.confirm(`Remove ${b.name}?`)) return
    await api(`/api/joblowski/boards/${b.id}`, 'DELETE')
    setBoards((all) => all.filter((x) => x.id !== b.id))
  })

  const saveOrder = async (list: CustomBoard[]) => {
    try {
      await api('/api/joblowski/boards/order', 'PUT', { ids: list.map((b) => b.id) })
    } catch (err) {
      setError(message(err))
    }
  }

  /** Moves a board one place within its section, or a whole section one place. */
  const move = (b: CustomBoard, step: -1 | 1) => {
    const group = groups.find((g) => g.title === b.section)!.boards
    const i = group.indexOf(b)
    const j = i + step
    if (j < 0 || j >= group.length) return
    const swapped = [...group]
    ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
    const next = groups.flatMap((g) => (g.title === b.section ? swapped : g.boards))
    setBoards(next)
    void saveOrder(next)
  }

  const moveSection = (title: string, step: -1 | 1) => {
    const i = sections.indexOf(title)
    const j = i + step
    if (j < 0 || j >= groups.length) return
    const order = [...groups]
    ;[order[i], order[j]] = [order[j], order[i]]
    const next = order.flatMap((g) => g.boards)
    setBoards(next)
    void saveOrder(next)
  }

  const renameSection = (title: string) => run(async () => {
    const name = window.prompt('Rename this section', title)?.trim()
    if (!name || name === title) return
    const inSection = boards.filter((b) => b.section === title)
    const updated = await Promise.all(inSection.map((b) => api<CustomBoard>(`/api/joblowski/boards/${b.id}`, 'PATCH', { section: name })))
    const byId = new Map(updated.map((b) => [b.id, b]))
    // Merging into an existing section: keep the boards together.
    const next = groupBoards(boards.map((b) => byId.get(b.id) ?? b)).flatMap((g) => g.boards)
    setBoards(next)
    await saveOrder(next)
  })

  const restore = () => run(async () => {
    const body = await api<{ boards: CustomBoard[]; added: number }>('/api/joblowski/boards/restore', 'POST')
    setBoards(body.boards)
    setNote(body.added ? `Added back ${body.added} standard ${body.added === 1 ? 'board' : 'boards'}.` : 'All the standard boards are already here.')
  })

  const card = 'block rounded-lg border border-gray-200 px-3 py-2.5 hover:border-sky-500'
  const tool = 'rounded px-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_11rem] max-w-xl">
          <input className={inputClass} aria-label="What to search for" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fill these links with a search, e.g. data manager" />
          <input className={inputClass} aria-label="Location" value={l} onChange={(e) => setL(e.target.value)} placeholder="Oslo" />
        </div>
        <span className="flex-1" />
        {editing && <button className={secondaryClass} onClick={restore}>Restore standard boards</button>}
        <button
          className={editing ? primaryClass : secondaryClass}
          onClick={() => { setEditing((e) => !e); setOpenId(null); setAdding(false) }}
        >
          {editing ? 'Done' : 'Edit boards'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {note && <p className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">{note}</p>}

      {groups.map((group, gi) => (
        <section key={group.title}>
          <div className="mb-2 flex items-center gap-1">
            <h2 className="text-sm font-semibold text-gray-900">{group.title}</h2>
            {editing && (
              <span className="ml-2 flex items-center text-sm">
                <button className={tool} aria-label={`Move ${group.title} up`} title="Move section up" disabled={gi === 0} onClick={() => moveSection(group.title, -1)}>↑</button>
                <button className={tool} aria-label={`Move ${group.title} down`} title="Move section down" disabled={gi === groups.length - 1} onClick={() => moveSection(group.title, 1)}>↓</button>
                <button className={`${tool} text-xs`} onClick={() => renameSection(group.title)}>Rename</button>
              </span>
            )}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {group.boards.map((b, i) => (
              openId === b.id ? (
                <li key={b.id} className="sm:col-span-2 lg:col-span-4">
                  <BoardForm
                    initial={{ name: b.name, urlTemplate: b.urlTemplate, section: b.section, note: b.note, quick: b.quick }}
                    sections={sections}
                    submitLabel="Save"
                    onSubmit={(d) => save(b.id, d)}
                    onCancel={() => setOpenId(null)}
                  />
                </li>
              ) : (
                <li key={b.id} className="relative">
                  {editing ? (
                    <div className={`${card} hover:border-gray-200`}>
                      <span className="block text-sm font-medium text-gray-900 break-words pr-6">{b.name}</span>
                      <span className="block truncate text-xs text-gray-500" title={b.urlTemplate}>{b.urlTemplate}</span>
                      <span className="mt-1.5 flex items-center gap-0.5 text-sm">
                        <button className={tool} aria-label={`Move ${b.name} earlier`} disabled={i === 0} onClick={() => move(b, -1)}>←</button>
                        <button className={tool} aria-label={`Move ${b.name} later`} disabled={i === group.boards.length - 1} onClick={() => move(b, 1)}>→</button>
                        <button className={`${tool} text-xs text-sky-800`} onClick={() => setOpenId(b.id)}>Edit</button>
                        {b.quick && <span className="ml-auto text-xs text-gray-400" title="Offered under the search box on Search">on Search</span>}
                      </span>
                      <button className="absolute right-2 top-2 text-gray-400 hover:text-red-700" aria-label={`Remove ${b.name}`} onClick={() => remove(b)}>×</button>
                    </div>
                  ) : (
                    <a className={card} href={boardUrl(b.urlTemplate, q, l)} target="_blank" rel="noopener">
                      <span className="block text-sm font-medium text-gray-900 break-words">{b.name}</span>
                      <span className="block text-xs text-gray-500">{b.note || ' '}</span>
                    </a>
                  )}
                </li>
              )
            ))}
          </ul>
        </section>
      ))}

      {boards.length === 0 && (
        <p className="text-sm text-gray-500">
          No boards yet. Add one below, or <button className="text-sky-800 hover:underline" onClick={restore}>bring back the standard ones</button>.
        </p>
      )}

      <section className="max-w-3xl">
        {adding ? (
          <BoardForm
            initial={{ name: '', urlTemplate: '', section: 'Your links', note: '', quick: false }}
            sections={sections}
            submitLabel="Add"
            onSubmit={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button className={secondaryClass} onClick={() => { setAdding(true); setOpenId(null) }}>+ Add a board</button>
        )}
      </section>
    </div>
  )
}
