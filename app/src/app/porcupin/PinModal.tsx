'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  GRAPH_NAMES, imageSrc, nodeHref, youtubeId,
  type BoardView, type GraphName, type PinLink, type PinView,
} from '@/lib/porcupin/types'
import { api, jsonBody } from './intake'

const AUTOSAVE_MS = 600

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

export default function PinModal({
  pin, boards, onClose, onPrev, onNext, onPatch, onDelete, onPinChanged, onError,
}: {
  pin: PinView
  boards: BoardView[]
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onPatch: (id: string, body: object) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onPinChanged: (pin: PinView) => void
  onError: (message: string) => void
}) {
  const [title, setTitle] = useState(pin.title ?? '')
  const [description, setDescription] = useState(pin.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const video = youtubeId(pin.sourceUrl)

  // Words are saved as you go, and flushed on the way out: Esc and the arrow
  // keys leave without the field ever blurring.
  const latest = useRef({ title, description })
  latest.current = { title, description }
  const saved = useRef({ title, description })
  const patch = useRef(onPatch)
  patch.current = onPatch
  const flush = useRef(() => {
    const now = latest.current
    if (now.title === saved.current.title && now.description === saved.current.description) return
    saved.current = now
    void patch.current(pin.id, now)
  })

  useEffect(() => {
    const timer = setTimeout(flush.current, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [title, description])
  useEffect(() => () => flush.current(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose, onPrev, onNext])

  const field = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500'
  const arrow = 'absolute top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 text-xl text-white hover:bg-black/70'

  return (
    <div role="dialog" aria-modal="true" aria-label={pin.title ?? pin.filename}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 sm:p-6">
      <div onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-6xl flex-col overflow-y-auto bg-white sm:rounded-2xl md:max-h-[92vh] md:flex-row md:overflow-hidden">
        <div className="relative flex shrink-0 items-center justify-center bg-gray-950 md:min-w-0 md:flex-1">
          {video ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video}`}
              title={pin.title ?? 'YouTube video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc(pin.id, 'full')} alt={pin.title ?? pin.filename} className="max-h-[60vh] max-w-full object-contain md:max-h-[92vh]" />
          )}
          {onPrev && <button aria-label="Previous" onClick={onPrev} className={`${arrow} left-3`}>‹</button>}
          {onNext && <button aria-label="Next" onClick={onNext} className={`${arrow} right-3`}>›</button>}
        </div>

        <div className="w-full space-y-5 p-5 md:w-96 md:shrink-0 md:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-xs text-gray-500">
              <p className="truncate" title={pin.filename}>{pin.filename}</p>
              <p>
                {new Date(pin.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                {' · '}{formatBytes(pin.sizeBytes)}
                {pin.width && pin.height ? ` · ${pin.width}×${pin.height}` : ''}
              </p>
              {pin.sourceUrl && (
                <a href={pin.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-amber-800 hover:underline">
                  {new URL(pin.sourceUrl).hostname}
                </a>
              )}
            </div>
            <button aria-label="Close" onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700">×</button>
          </div>

          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              placeholder="Add a title" aria-label="Title" className={`${field} font-medium`} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4}
              placeholder="Add a description" aria-label="Description" className={`${field} resize-y`} />
          </div>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Projects</h2>
            {boards.length === 0 ? (
              <p className="text-sm text-gray-500">Only in ALL. Create a project on the board to sort it into one.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {boards.map((b) => {
                  const inBoard = pin.boardIds.includes(b.id)
                  return (
                    <button key={b.id} aria-pressed={inBoard}
                      onClick={() => void onPatch(pin.id, inBoard ? { removeBoard: b.id } : { addBoard: b.id })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${inBoard ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {inBoard ? '✓ ' : ''}{b.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <NodeLinks pin={pin} onPinChanged={onPinChanged} onError={onError} />

          <div className="border-t border-gray-100 pt-3">
            {confirmDelete ? (
              <div className="flex items-center gap-3 text-sm">
                <button onClick={() => void onDelete(pin.id)} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700">
                  Delete for good
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-gray-500 hover:text-gray-800">Keep it</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-sm text-gray-500 hover:text-red-700">Delete photo</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const BADGE: Record<GraphName, string> = {
  focus: 'bg-orange-100 text-orange-900',
  quilt: 'bg-rose-100 text-rose-900',
}

function GraphBadge({ graph }: { graph: GraphName }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE[graph]}`}>{GRAPH_NAMES[graph]}</span>
}

function NodeLinks({ pin, onPinChanged, onError }: {
  pin: PinView
  onPinChanged: (pin: PinView) => void
  onError: (message: string) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PinLink[]>([])
  const [searched, setSearched] = useState(false)
  const [focusDown, setFocusDown] = useState(false)
  const latestSearch = useRef(0)

  useEffect(() => {
    const term = q.trim()
    const ticket = ++latestSearch.current
    if (!term) { setHits([]); setSearched(false); return }
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ hits: { graph: GraphName; nodeId: string; label: string }[]; focusAvailable: boolean }>(
          `/api/porcupin/nodes?q=${encodeURIComponent(term)}`,
        )
        if (ticket !== latestSearch.current) return
        setHits(res.hits)
        setFocusDown(!res.focusAvailable)
        setSearched(true)
      } catch (err) {
        onError((err as Error).message)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [q, onError])

  const add = async (hit: PinLink) => {
    setQ('')
    try {
      onPinChanged(await api<PinView>(`/api/porcupin/pins/${pin.id}/links`, jsonBody('POST', hit)))
    } catch (err) {
      onError((err as Error).message)
    }
  }

  const remove = async (link: PinLink) => {
    const params = new URLSearchParams({ graph: link.graph, nodeId: link.nodeId })
    try {
      onPinChanged(await api<PinView>(`/api/porcupin/pins/${pin.id}/links?${params}`, { method: 'DELETE' }))
    } catch (err) {
      onError((err as Error).message)
    }
  }

  const available = hits.filter((h) => !pin.links.some((l) => l.graph === h.graph && l.nodeId === h.nodeId))

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Linked notes</h2>
      {pin.links.length > 0 && (
        <ul className="mb-2 space-y-1">
          {pin.links.map((l) => (
            <li key={`${l.graph}:${l.nodeId}`} className="flex items-center gap-2 text-sm">
              <GraphBadge graph={l.graph} />
              <Link href={nodeHref(l)} className="min-w-0 flex-1 truncate text-gray-800 hover:underline" title={`Open in ${GRAPH_NAMES[l.graph]}`}>
                {l.label}
              </Link>
              <button aria-label={`Unlink ${l.label}`} onClick={() => void remove(l)} className="text-gray-400 hover:text-red-700">×</button>
            </li>
          ))}
        </ul>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Link a Focus or Quilt node…" aria-label="Search graph nodes"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500" />
      {available.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200">
          {available.map((h) => (
            <li key={`${h.graph}:${h.nodeId}`}>
              <button onClick={() => void add(h)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-amber-50">
                <GraphBadge graph={h.graph} />
                <span className="truncate">{h.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && available.length === 0 && <p className="mt-1 text-xs text-gray-500">No nodes match that.</p>}
      {focusDown && <p className="mt-1 text-xs text-gray-500">The Focus graph could not be read, so only Quilt was searched.</p>}
    </section>
  )
}
