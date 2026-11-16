'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OrgEditor, { type OrgEditorHandle } from '@/components/org/OrgEditor'

type Daily = { date: string; path: string; exists: boolean; text: string; sha: string | null }
type Hit = { orgId: string | null; title: string; olp: string[] }

const today = () => new Date().toLocaleDateString('sv-SE')
const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const long = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** How long typing must pause before the daily is saved. */
const SAVE_AFTER_MS = 1000

/**
 * A day's daily, open to write in. It saves itself a moment after you stop
 * typing. If the daily changed somewhere else meanwhile (another tab, a tick
 * in Quilt's routine panel), saving stops and asks rather than overwrite it.
 */
export default function DailyApp({ initialDate }: { initialDate: string | null }) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate ?? today())
  const [daily, setDaily] = useState<Daily | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'saving' | 'conflict'>('saved')
  const [conflict, setConflict] = useState<{ text: string; sha: string } | null>(null)
  const [making, setMaking] = useState(false)
  const [linking, setLinking] = useState(false)
  const editor = useRef<OrgEditorHandle>(null)
  const latest = useRef('')
  const sha = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  // Dates are written in the reader's own locale and time zone, which the server can't know: wait for the browser.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const load = useCallback(async (day: string) => {
    setError('')
    const res = await fetch(`/api/org/daily?date=${day}`)
    const body = await res.json()
    if (!res.ok) { setError(body.error ?? 'Could not load the daily'); return }
    latest.current = body.text
    sha.current = body.sha
    setDaily(body)
    setStatus('saved')
    setConflict(null)
  }, [])

  useEffect(() => { void load(date) }, [date, load])

  const save = useCallback(async (force = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (inFlight.current) await inFlight.current
    const sent = latest.current
    const run = (async () => {
      setStatus('saving')
      const res = await fetch('/api/org/daily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, text: sent, expectedSha: sha.current, force }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setConflict({ text: body.text, sha: body.sha })
        setStatus('conflict')
        return
      }
      if (!res.ok) { setError(body.error ?? 'Could not save'); setStatus('unsaved'); return }
      sha.current = body.sha
      setConflict(null)
      // The stored text is the canonical layout of what was sent; take it only if nothing was typed since.
      if (latest.current === sent && body.text !== sent) {
        latest.current = body.text
        editor.current?.setText(body.text)
      }
      setStatus(latest.current === sent || latest.current === body.text ? 'saved' : 'unsaved')
    })()
    inFlight.current = run
    await run
    inFlight.current = null
  }, [date])

  const changed = useCallback((text: string) => {
    latest.current = text
    if (status === 'conflict') return
    setStatus('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, SAVE_AFTER_MS)
  }, [save, status])

  // Don't lose the last few keystrokes when leaving.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status === 'unsaved' || status === 'saving') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  const go = async (day: string) => {
    if (status === 'unsaved') await save()
    setDaily(null)
    setDate(day)
    router.replace(day === today() ? '/daily' : `/daily?date=${day}`)
  }

  const make = async () => {
    setMaking(true)
    try {
      const res = await fetch('/api/org/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not make the daily')
      latest.current = body.daily.text
      sha.current = body.daily.sha
      setDaily(body.daily)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMaking(false)
    }
  }

  const follow = (target: string) => {
    if (target.startsWith('id:')) window.open(`/quilt/org?focus=${encodeURIComponent(target.slice(3))}`, '_blank')
    else if (/^https?:\/\//.test(target)) window.open(target, '_blank', 'noopener')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => go(shift(date, -1))} className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50" aria-label="Previous day">‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
        <button onClick={() => go(shift(date, 1))} className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50" aria-label="Next day">›</button>
        {mounted && date !== today() && <button onClick={() => go(today())} className="text-sm text-sky-800 hover:underline">Today</button>}
        <span className="ml-auto text-xs text-gray-500" role="status">
          {status === 'saved' && daily?.exists && 'Saved'}
          {status === 'unsaved' && 'Typing…'}
          {status === 'saving' && 'Saving…'}
          {status === 'conflict' && <span className="text-amber-700">Not saved: changed elsewhere</span>}
        </span>
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">{mounted ? long(date) : date}</h1>
      <p className="mb-3 text-xs text-gray-500">
        Ctrl+K links a note · Ctrl+click follows a link · click a box to tick it ·{' '}
        <Link href="/quilt/org" className="text-sky-800 hover:underline">routine in Quilt</Link>
      </p>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {conflict && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This daily changed somewhere else since you opened it (perhaps a tick in Quilt, or another tab).
          <div className="mt-1.5 flex gap-3">
            <button className="underline" onClick={() => { latest.current = conflict.text; sha.current = conflict.sha; editor.current?.setText(conflict.text); setConflict(null); setStatus('saved') }}>
              Use the other version
            </button>
            <button className="underline" onClick={() => { sha.current = conflict.sha; void save(true) }}>Keep what I typed</button>
          </div>
        </div>
      )}

      {daily && !daily.exists && (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
          <p className="mb-3 text-sm text-gray-600">No daily for this day yet.</p>
          <button onClick={make} disabled={making} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
            {making ? 'Making…' : 'Make it from the template'}
          </button>
          <p className="mt-2 text-xs text-gray-400">The routine from Templates/routine.org, then the day&apos;s scheduled tasks and a place for notes.</p>
        </div>
      )}

      {daily?.exists && (
        <div className="rounded-xl border border-gray-200 bg-white px-5">
          <OrgEditor key={`${date}:${daily.sha === null ? 'new' : 'loaded'}`} ref={editor} initial={daily.text} onChange={changed}
            onLinkRequest={() => setLinking(true)} onFollow={follow} onSave={() => void save()} placeholderText="Write…" />
        </div>
      )}

      {linking && <LinkPicker onPick={(h) => { setLinking(false); editor.current?.insert(`[[id:${h.orgId}][${h.title.replace(/[[\]]/g, '')}]]`) }} onClose={() => { setLinking(false); editor.current?.focus() }} />}
    </div>
  )
}

/** Find a note by name and link to it: the org-roam-node-insert of janki. */
function LinkPicker({ onPick, onClose }: { onPick: (h: Hit & { orgId: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<(Hit & { orgId: string })[]>([])
  const [at, setAt] = useState(0)
  useEffect(() => {
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/notes/find?q=${encodeURIComponent(q)}&limit=20`, { signal: ctl.signal })
        const body = await res.json()
        setHits((body.hits ?? []).filter((h: Hit) => h.orgId))
        setAt(0)
      } catch { /* a newer search replaced it */ }
    }, 120)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])
  return (
    <div role="dialog" aria-label="Link a note" className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Link to which note?"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && hits[at]) { e.preventDefault(); onPick(hits[at]) }
          }} />
        <ul className="mt-2 max-h-80 overflow-y-auto">
          {hits.map((h, i) => (
            <li key={h.orgId}>
              <button onClick={() => onPick(h)} onMouseEnter={() => setAt(i)}
                className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${i === at ? 'bg-sky-50 text-sky-900' : 'text-gray-800'}`}>
                {h.title}
                {h.olp.length > 0 && <span className="ml-2 text-xs text-gray-400">{h.olp.join(' › ')}</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">{q ? 'No note by that name' : 'Type a name'}</li>}
        </ul>
      </div>
    </div>
  )
}
