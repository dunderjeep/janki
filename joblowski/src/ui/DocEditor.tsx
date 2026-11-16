'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { renderPage } from '../lib/render'
import { PLACEHOLDER, type Doc, type DocStyle, type DraftNotes, type Revision } from '../lib/types'
import type { ChatMessage } from '../lib/chat'
import { api, message, secondaryClass, shortDate } from './ui'
import DocChat from './DocChat'

const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), { ssr: false })

const AUTOSAVE_MS = 800
const A4_WIDTH_PX = 794

type State = 'saved' | 'saving' | 'unsaved' | 'error'

function NoteList({ title, items, tone = 'text-gray-700', onAnswer }: {
  title: string; items: string[]; tone?: string; onAnswer?: (item: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className={`font-medium ${tone}`}>{title}</p>
      <ul className="mt-0.5 list-disc pl-4 text-gray-700 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="break-words">
            {item}
            {onAnswer && (
              <button className="ml-2 text-xs text-sky-800 hover:underline" onClick={() => onAnswer(item)}>Answer</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What to verify in a draft from Claude. The first two lists come from code, not the model. */
function DraftReview({ notes, originalId, onAnswer }: { notes: DraftNotes; originalId: string | null; onAnswer: (item: string) => void }) {
  const [open, setOpen] = useState(true)
  const flagged = notes.newNumbers.length + notes.termsFromAd.length
  return (
    <section className="mb-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-gray-900">
          Review this draft from Claude{flagged > 0 && <span className="ml-2 text-amber-800">{flagged} to check</span>}
        </p>
        <span className="flex shrink-0 gap-3">
          {originalId && <Link className="text-sky-800 hover:underline" href={`/joblowski/docs/${originalId}`}>Original</Link>}
          <button className="text-sky-800 hover:underline" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
        </span>
      </div>
      {open && (
        <div className="mt-2 grid max-h-44 gap-3 overflow-y-auto md:grid-cols-2">
          <NoteList title="Figures not in your original" items={notes.newNumbers} tone="text-amber-800" onAnswer={onAnswer} />
          <NoteList title="Terms from the ad, not your original: are these true of you?" items={notes.termsFromAd} tone="text-amber-800" onAnswer={onAnswer} />
          <NoteList title="Instructions hidden in the ad, ignored" items={notes.suspiciousInstructions} tone="text-red-700" />
          <NoteList title="Requirements you have no evidence for" items={notes.gaps} onAnswer={onAnswer} />
          <NoteList title="What changed" items={notes.changes} />
          <NoteList title="Keywords from the ad now used" items={notes.keywordsUsed} />
        </div>
      )}
    </section>
  )
}

export default function DocEditor({ initial }: { initial: Doc }) {
  const [name, setName] = useState(initial.name)
  const [style, setStyle] = useState<DocStyle>(initial.style)
  const [body, setBody] = useState(initial.body)
  const [editorKey, setEditorKey] = useState(0)
  const [revisions, setRevisions] = useState<Revision[]>(initial.revisions)
  const [showHistory, setShowHistory] = useState(false)
  const [state, setState] = useState<State>('saved')
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.6)
  const [notes, setNotes] = useState<DraftNotes | null>(initial.aiNotes)
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null)
  const [preview, setPreview] = useState<ChatMessage | null>(null)
  const previewBox = useRef<HTMLDivElement>(null)

  // What is on the server, and the save in flight, so edits are never reordered.
  const latest = useRef({ name, style, body })
  latest.current = { name, style, body }
  const stored = useRef({ name: initial.name, style: initial.style as DocStyle, body: initial.body })
  const flight = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback((): Promise<void> => {
    flight.current = flight.current.then(async () => {
      const next = { ...latest.current }
      if (!next.name.trim()) return
      if (next.name === stored.current.name && next.style === stored.current.style && next.body === stored.current.body) return
      setState('saving')
      try {
        await api(`/api/joblowski/documents/${initial.id}`, 'PATCH', next)
        stored.current = next
        const current = latest.current
        setState(current.name === next.name && current.style === next.style && current.body === next.body ? 'saved' : 'unsaved')
        setError(null)
      } catch (err) {
        setState('error')
        setError(message(err))
      }
    })
    return flight.current
  }, [initial.id])

  useEffect(() => {
    if (name === stored.current.name && style === stored.current.style && body === stored.current.body) return
    setState('unsaved')
    const timer = setTimeout(() => void flush(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [name, style, body, flush])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const { name: n, style: s, body: b } = latest.current
      if (n !== stored.current.name || s !== stored.current.style || b !== stored.current.body) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    const box = previewBox.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(1, entry.contentRect.width / A4_WIDTH_PX)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const shown = preview?.proposal?.body ?? body
  const page = useMemo(() => renderPage({ title: name, body: shown, style, kind: initial.kind }), [name, shown, style, initial.kind])

  const answer = (item: string) => setPrefill((p) => ({ text: `About "${item.length > 80 ? `${item.slice(0, 80)}…` : item}": `, n: (p?.n ?? 0) + 1 }))

  /** Claude's revision into the editor, with what was there kept as a version on the server. */
  const applyRevision = async (m: ChatMessage) => {
    await flush()
    if (latest.current.body !== stored.current.body) throw new Error('Your latest edits are not saved yet. Try again in a moment.')
    const doc = await api<{ body: string; aiNotes: DraftNotes | null; revisions: Revision[] }>(`/api/joblowski/documents/${initial.id}/chat/${m.id}/apply`, 'POST')
    stored.current = { ...stored.current, body: doc.body }
    setBody(doc.body)
    setNotes(doc.aiNotes)
    setRevisions(doc.revisions)
    setPreview(null)
    setEditorKey((k) => k + 1)
  }
  const unfilled = [...new Set(body.match(PLACEHOLDER) ?? [])]

  const saveVersion = async () => {
    const label = window.prompt('Name this version (optional)', '')
    if (label === null) return
    try {
      await flush()
      const revision = await api<Revision>(`/api/joblowski/documents/${initial.id}/versions`, 'POST', { label })
      setRevisions((all) => [revision, ...all])
      setShowHistory(true)
    } catch (err) {
      setError(message(err))
    }
  }

  const restore = async (revision: Revision) => {
    if (!window.confirm('Replace the text with this version? What you have now is kept as a version first.')) return
    try {
      await flush()
      const backup = await api<Revision>(`/api/joblowski/documents/${initial.id}/versions`, 'POST', { label: 'Before restoring' })
      const old = await api<{ body: string; style: DocStyle }>(`/api/joblowski/revisions/${revision.id}/restore`)
      setRevisions((all) => [backup, ...all])
      setBody(old.body)
      setStyle(old.style)
      setEditorKey((k) => k + 1)
    } catch (err) {
      setError(message(err))
    }
  }

  const downloadPdf = async () => {
    await flush()
    window.location.href = `/api/joblowski/documents/${initial.id}/pdf`
  }

  const stateText: Record<State, string> = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Not saved' }

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Link href={`/joblowski?tab=${initial.kind === 'resume' ? 'resumes' : 'letters'}`} className="text-sm text-sky-800 hover:underline">
          ← {initial.kind === 'resume' ? 'Résumés' : 'Cover letters'}
        </Link>
        <input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-gray-900 hover:border-gray-200 focus:border-gray-200 focus:outline-none"
        />
        <span className={`text-xs ${state === 'error' ? 'text-red-700' : 'text-gray-500'}`} role="status">{stateText[state]}</span>
        <label className="text-sm text-gray-600">
          <span className="sr-only">Style</span>
          <select className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm" value={style} onChange={(e) => setStyle(e.target.value as DocStyle)}>
            <option value="classic">Classic</option>
            <option value="modern">Modern</option>
          </select>
        </label>
        <button className={secondaryClass} onClick={() => setShowHistory((s) => !s)}>Versions ({revisions.length})</button>
        <button className={secondaryClass} onClick={saveVersion}>Save version</button>
        <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800" onClick={downloadPdf}>Download PDF</button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      {unfilled.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-950">
          Still to fill in: {unfilled.join(', ')}. Copy on a tracked job fills these, or type over them before sending.
        </p>
      )}

      {notes && <DraftReview notes={notes} originalId={initial.derivedFrom} onAnswer={answer} />}
      <DocChat docId={initial.id} prefill={prefill} previewing={preview?.id ?? null} onPreview={setPreview} onApply={applyRevision} />

      {showHistory && (
        <div className="mb-3 rounded-lg border border-gray-200 p-3">
          {revisions.length === 0 ? (
            <p className="text-sm text-gray-500">No versions yet. One is kept as you edit, and each time this is attached to an application.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-800">
                    {new Date(r.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, {shortDate(r.createdAt)}
                    {r.label && <span className="ml-2 text-gray-500">{r.label}</span>}
                  </span>
                  <span className="flex gap-3 shrink-0">
                    <a className="text-sky-800 hover:underline" href={`/api/joblowski/revisions/${r.id}/pdf`}>PDF</a>
                    <button className="text-sky-800 hover:underline" onClick={() => restore(r)}>Restore</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[75vh] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <MarkdownEditor key={editorKey} value={body} onChange={setBody} />
        </div>
        <div ref={previewBox} className={`relative h-[75vh] overflow-hidden rounded-lg border bg-gray-100 ${preview ? 'border-sky-500 ring-2 ring-sky-200' : 'border-gray-200'}`}>
          {preview && (
            <p className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-sky-700 px-3 py-1.5 text-xs text-white">
              <span>Previewing Claude&apos;s revision. Your text is unchanged.</span>
              <button className="underline" onClick={() => setPreview(null)}>Back to yours</button>
            </p>
          )}
          <iframe
            title="Preview"
            sandbox=""
            srcDoc={page}
            style={{ zoom, width: A4_WIDTH_PX, height: `calc(75vh / ${zoom})`, border: 0, display: 'block', background: '#fff' }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        # is your name, ## a section, ### a job, and anything after a | on a ### line goes to the right margin. Begin a line with - for a bullet.
      </p>
    </div>
  )
}
