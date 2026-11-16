'use client'

/**
 * Loads one item's text and keeps it saved.
 *
 * Saves are strictly one at a time, each carrying the fingerprint the last one
 * returned, so an org file can only be overwritten by the version it follows.
 * When a save is refused nothing retries on its own: the text stays in the
 * editor and the choice is shown.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BodyView, ItemView } from '@/lib/scatterbrain/types'
import MarkdownEditor, { type EditorCommands } from './MarkdownEditor'
import type { Actions } from './Workspace'

const SAVE_AFTER_MS = 1500
/** Browsers drop keepalive requests over 64 KB. */
const KEEPALIVE_LIMIT = 60_000

type Status = 'saved' | 'unsaved' | 'saving' | 'error'
type Conflict = { conflict: 'changed'; message: string }

const STATUS_TEXT: Record<Status, string> = { saved: 'Saved', unsaved: 'Editing…', saving: 'Saving…', error: 'Not saved' }

export default function EditorPane({ item, words, actions }: { item: ItemView; words: number; actions: Actions }) {
  const url = `/api/scatterbrain/items/${item.id}/body`
  const [loaded, setLoaded] = useState<BodyView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<Status>('saved')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [commands, setCommands] = useState<EditorCommands | null>(null)

  const text = useRef('')
  const fingerprint = useRef<string | null>(null)
  const dirty = useRef(false)
  const saving = useRef(false)
  const again = useRef(false)
  const halted = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { patchItem, setSessionWords } = actions
  const itemId = item.id

  const adopt = useCallback((body: BodyView) => {
    text.current = body.markdown
    fingerprint.current = body.sha
    dirty.current = false
    halted.current = false
    setLoaded(body)
    setConflict(null)
    setStatus('saved')
    setRevision((r) => r + 1)
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(url)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setLoadError(json.error ?? 'Could not load this text')
      return
    }
    adopt(json as BodyView)
  }, [adopt, url])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async (force = false) => {
    if (timer.current) clearTimeout(timer.current)
    if (!dirty.current && !force) return
    if (halted.current && !force) return
    if (saving.current) {
      again.current = true
      return
    }
    saving.current = true
    dirty.current = false
    setStatus('saving')
    const markdown = text.current
    try {
      const body = JSON.stringify({ markdown, expectedSha: fingerprint.current, force })
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < KEEPALIVE_LIMIT,
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) {
        halted.current = true
        dirty.current = true
        setConflict(json as Conflict)
        setStatus('error')
      } else if (!res.ok) {
        throw new Error(json.error ?? 'Save failed')
      } else {
        fingerprint.current = json.sha
        halted.current = false
        setConflict(null)
        setStatus(dirty.current ? 'unsaved' : 'saved')
        patchItem(itemId, { wordCount: json.wordCount })
        setSessionWords(json.sessionWords)
      }
    } catch {
      dirty.current = true
      setStatus('error')
    } finally {
      saving.current = false
      if (again.current) {
        again.current = false
        void save()
      }
    }
  }, [itemId, patchItem, setSessionWords, url])

  const onChange = useCallback((next: string) => {
    text.current = next
    dirty.current = true
    if (halted.current) return
    setStatus('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), SAVE_AFTER_MS)
  }, [save])

  // Leaving this item, or the page, takes unsaved text with it.
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return
      void save()
      e.preventDefault()
    }
    window.addEventListener('beforeunload', leaving)
    return () => {
      window.removeEventListener('beforeunload', leaving)
      void save()
    }
  }, [save])

  // Coming back to the tab: take the new version if there is nothing here to lose.
  useEffect(() => {
    if (!item.orgPath) return
    const check = async () => {
      if (dirty.current || saving.current) return
      const res = await fetch(url)
      if (!res.ok) return
      const body = (await res.json()) as BodyView
      if (body.sha !== fingerprint.current && !dirty.current && !saving.current) adopt(body)
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [adopt, item.orgPath, url])

  if (loadError) return <div role="alert" className="p-8 text-sm text-red-700">{loadError}</div>
  if (!loaded) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (loaded.missing) {
    return (
      <div role="alert" className="p-8 text-sm text-gray-700">
        <code>{loaded.orgPath}</code> is no longer in your org directory. It may have been moved or renamed.
      </div>
    )
  }

  const button = 'rounded px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-100'

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-3 py-1">
        <button className={`${button} font-bold`} title="Bold (Ctrl+B)" aria-label="Bold" onClick={() => commands?.bold()}>B</button>
        <button className={`${button} italic`} title="Italic (Ctrl+I)" aria-label="Italic" onClick={() => commands?.italic()}>I</button>
        <button className={button} title="Heading" onClick={() => commands?.heading()}>H</button>
        <button className={button} title="Quote" onClick={() => commands?.quote()}>“ ”</button>
        <button className={button} title="List" onClick={() => commands?.list()}>List</button>
        {loaded.orgPath && (
          <span className="ml-3 truncate text-xs text-emerald-700" title="Saved straight to this file, as Org">{loaded.orgPath}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs tabular-nums text-gray-500">
          {words.toLocaleString()}{item.targetWords ? ` / ${item.targetWords.toLocaleString()}` : ''} words
          {item.targetWords ? (
            <span role="progressbar" aria-label="Target for this item" aria-valuemin={0} aria-valuemax={item.targetWords} aria-valuenow={Math.min(words, item.targetWords)} className="block h-1 w-16 overflow-hidden rounded-full bg-gray-200">
              <span className={`block h-full ${words >= item.targetWords ? 'bg-emerald-500' : 'bg-purple-600'}`} style={{ width: `${Math.min(100, (words / item.targetWords) * 100)}%` }} />
            </span>
          ) : null}
        </span>
        <span aria-live="polite" className={`ml-3 shrink-0 text-xs ${status === 'error' ? 'font-medium text-red-700' : 'text-gray-400'}`}>
          {STATUS_TEXT[status]}
        </span>
      </div>

      {conflict && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>{conflict.message} Your text is still here and has not been written.</span>
          {conflict.conflict === 'changed' ? (
            <>
              <button onClick={() => void load()} className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100">Use the saved version</button>
              <button onClick={() => void save(true)} className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100">Overwrite with mine</button>
            </>
          ) : (
            <button onClick={() => { halted.current = false; dirty.current = true; void save() }} className="rounded border border-amber-400 bg-white px-2 py-0.5 hover:bg-amber-100">Try again</button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MarkdownEditor key={revision} value={loaded.markdown} onChange={onChange} onReady={setCommands} />
      </div>
    </div>
  )
}
