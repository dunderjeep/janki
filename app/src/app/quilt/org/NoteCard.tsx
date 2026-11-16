'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'reactflow'
import OrgText from './OrgText'
import LinkedPins from '@/components/porcupin/LinkedPins'
import type { OrgGraphNode } from './orgGraph'

export const CARD_W = 440
/** Space between the dot and the card's edge, in screen pixels. */
export const CARD_GAP = 28

type Body = { text: string; file: string }

/**
 * A note's text, open on the canvas beside its own dot.
 *
 * The point is to read a note without leaving the place it sits: its
 * neighbours stay visible around the card, and following a link moves you along
 * the graph instead of into another window. A trip to another window is what
 * loses the thread, so reading and editing both happen here.
 *
 * Positioned in screen space from the node's live position, not drawn as a
 * node: as a node it would shrink with the zoom and be unreadable exactly when
 * the graph around it is most legible.
 */
export default function NoteCard({
  node, ringLabel, ringColor, known, onFollow, onClose, onSaved, onEditingChange, footer,
}: {
  node: OrgGraphNode
  ringLabel: string
  ringColor: string
  known: (id: string) => boolean
  onFollow: (id: string) => void
  onClose: () => void
  /** The text changed — links in it may have too. */
  onSaved: () => void
  onEditingChange: (editing: boolean) => void
  footer?: ReactNode
}) {
  const [body, setBody] = useState<Body | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editing = draft !== null
  const dirty = editing && draft !== body?.text

  // Live position, so the card rides along with a pan, a zoom or a drag.
  const internals = useStore(s => s.nodeInternals.get(node.id))
  const [tx, ty, zoom] = useStore(s => s.transform)
  const paneW = useStore(s => s.width)
  const paneH = useStore(s => s.height)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/org/node?id=${encodeURIComponent(node.id)}`)
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'failed'); setBody(null); return }
    setBody(json)
  }, [node.id])

  useEffect(() => { setBody(null); setDraft(null); load() }, [load])
  useEffect(() => { onEditingChange(editing) }, [editing, onEditingChange])

  const save = useCallback(async () => {
    if (draft === null || !body || saving) return
    if (!dirty) { setDraft(null); return }
    setSaving(true)
    setError(null)
    const res = await fetch('/api/org/node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: node.id, expected: body.text, text: draft }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'failed'); return }
    setDraft(null)
    await load()
    onSaved()
  }, [draft, body, saving, dirty, node.id, load, onSaved])

  const cancel = useCallback(() => {
    if (dirty && !window.confirm('Discard your changes to this note?')) return
    setDraft(null)
    setError(null)
  }, [dirty])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editing) cancel()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, cancel, onClose])

  if (!internals?.positionAbsolute) return null

  // Beside the dot, on whichever side has room; the dot is the node's top
  // centre, so the card's top edge lines up just above it.
  const dotX = (internals.positionAbsolute.x + (internals.width ?? 0) / 2) * zoom + tx
  const dotY = internals.positionAbsolute.y * zoom + ty
  const right = dotX + CARD_GAP + CARD_W <= paneW - 8
  const left = right ? dotX + CARD_GAP : Math.max(8, dotX - CARD_GAP - CARD_W)
  const maxH = Math.max(200, paneH - 24)
  const top = Math.min(Math.max(12, dotY - 24), Math.max(12, paneH - maxH - 12))

  return (
    <div
      className="absolute z-30 rounded-lg border border-gray-200 bg-white shadow-xl flex flex-col"
      style={{ left, top, width: CARD_W, maxHeight: Math.min(maxH, paneH * 0.8) }}
      // Wheel over the card scrolls the card, not the canvas under it.
      onWheel={e => e.stopPropagation()}
    >
      <div className="h-1 rounded-t-lg flex-shrink-0" style={{ backgroundColor: ringColor }} />
      <div className="px-3 pt-2 pb-1.5 flex items-start gap-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 leading-snug">{node.title}</div>
          <div className="text-[10px] text-gray-400">
            {ringLabel}
          </div>
        </div>
        {!editing && body && (
          <button onClick={() => setDraft(body.text)}
            className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-700">
            Edit
          </button>
        )}
        <button onClick={editing ? cancel : onClose} title="Close (Esc)"
          className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1">×</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {error && <div className="text-[11px] text-red-600 mb-2 break-words">{error}</div>}
        {!body && !error && <div className="text-xs text-gray-400">Reading…</div>}
        {body && !editing && (
          body.text.trim()
            ? <OrgText text={body.text} known={known} onFollow={onFollow} />
            : <button onClick={() => setDraft('')} className="text-xs text-gray-400 italic hover:text-indigo-600">
                Empty — write something
              </button>
        )}
        {editing && (
          <textarea
            autoFocus
            value={draft}
            disabled={saving}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) {
                e.preventDefault()
                save()
              }
            }}
            spellCheck
            className="w-full min-h-[16rem] font-mono text-[12px] leading-relaxed border border-gray-200 rounded
                       p-2 focus:outline-none focus:border-indigo-400 resize-y"
            style={{ height: Math.min(Math.max(256, (draft ?? '').split('\n').length * 20 + 24), maxH - 140) }}
          />
        )}
      </div>

      {editing && (
        <div className="px-3 py-1.5 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
          <span className="flex-1 text-[10px] text-gray-400">
            {saving ? 'saving…' : 'Ctrl+S save · Esc cancel'}
          </span>
          <button onClick={cancel} className="text-[11px] text-gray-500 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            Save
          </button>
        </div>
      )}

      {!editing && <LinkedPins graph="focus" nodeId={node.id} className="border-t border-gray-100 px-3 py-2 flex-shrink-0" />}
      {!editing && footer && <div className="border-t border-gray-100 flex-shrink-0">{footer}</div>}
    </div>
  )
}
