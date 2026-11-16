'use client'

/**
 * WikiText — renders card text with [[wikilink]] support.
 *
 * Syntax: [[term]] anywhere in front or back text.
 * - Renders the term with a dotted underline.
 * - Click to open a popup showing the linked card's back.
 * - If no card found: offers to generate one with Claude (Haiku).
 * - Plain text segments (including LaTeX) are rendered by LatexText.
 *
 * Example:
 *   "The [[gauge field]] A_μ is a [[Lie algebra]]-valued 1-form"
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { LatexText } from './LatexText'

// ── Types ──────────────────────────────────────────────────────────────────────

type LinkedCard = {
  id:       string
  front:    string
  back:     string
  deckId:   string
  deckName: string
}

type PopupState =
  | { phase: 'loading' }
  | { phase: 'found';     card: LinkedCard }
  | { phase: 'not_found' }
  | { phase: 'generating' }
  | { phase: 'generated'; card: LinkedCard }
  | { phase: 'error';     message: string }

// ── WikiLink — a single [[term]] rendered as an interactive span ──────────────

function WikiLink({
  term,
  deckId,
  cardContext,
}: {
  term:        string
  deckId:      string
  cardContext: string
}) {
  const [open,      setOpen]      = useState(false)
  const [popup,     setPopup]     = useState<PopupState | null>(null)
  const containerRef = useRef<HTMLSpanElement>(null)

  // Fetch on first open
  useEffect(() => {
    if (!open || popup) return
    setPopup({ phase: 'loading' })
    fetch(`/api/srs/cards/lookup?term=${encodeURIComponent(term)}`)
      .then(r => r.json())
      .then(data => {
        if (data.card) setPopup({ phase: 'found', card: data.card })
        else           setPopup({ phase: 'not_found' })
      })
      .catch(e => setPopup({ phase: 'error', message: e.message }))
  }, [open, term, popup])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function handleGenerate() {
    setPopup({ phase: 'generating' })
    try {
      const res  = await fetch('/api/srs/cards/generate-stub', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ term, deckId, context: cardContext }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setPopup({ phase: 'generated', card: data.card })
    } catch (e: any) {
      setPopup({ phase: 'error', message: e.message })
    }
  }

  return (
    <span ref={containerRef} className="relative inline">
      {/* The linked term */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`border-b border-dashed pb-px transition-colors ${
          open
            ? 'border-indigo-500 text-indigo-700'
            : 'border-indigo-300 text-indigo-600 hover:border-indigo-500 hover:text-indigo-800'
        }`}
        title={`[[${term}]]`}
      >
        <LatexText text={term} />
      </button>

      {/* Popup */}
      {open && (
        <span
          className="absolute bottom-full left-0 z-50 block w-80 bg-white border border-gray-200 rounded-xl shadow-2xl text-sm"
          style={{ marginBottom: '6px' }}
          // Prevent link-clicks inside the popup from closing it
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Header */}
          <span className="flex items-center justify-between px-3 pt-3 pb-1 border-b border-gray-100 block">
            <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">
              [[{term}]]
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-300 hover:text-gray-500 text-base leading-none"
            >×</button>
          </span>

          {/* Body */}
          <span className="block px-3 py-3">
            {popup?.phase === 'loading' && (
              <span className="block text-xs text-gray-400 animate-pulse">Looking up…</span>
            )}

            {popup?.phase === 'found' && (
              <span className="block space-y-2">
                <LatexText text={popup.card.back} className="text-gray-700 text-xs leading-relaxed block" />
                <span className="flex items-center justify-between pt-1 border-t border-gray-50 block">
                  <span className="text-[10px] text-gray-400">{popup.card.deckName}</span>
                  <a
                    href={`/srs/${popup.card.deckId}/cards/${popup.card.id}`}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Open card →
                  </a>
                </span>
              </span>
            )}

            {popup?.phase === 'not_found' && (
              <span className="block space-y-2">
                <span className="block text-xs text-gray-400">
                  No card found for <em>"{term}"</em>.
                </span>
                <button
                  onClick={handleGenerate}
                  className="w-full text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-2 transition-colors text-left"
                >
                  ⊕ Generate card with Claude
                </button>
              </span>
            )}

            {popup?.phase === 'generating' && (
              <span className="block text-center py-2">
                <span className="inline-block animate-spin w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full mb-1 block mx-auto" />
                <span className="block text-xs text-gray-400">Generating…</span>
              </span>
            )}

            {popup?.phase === 'generated' && (
              <span className="block space-y-2">
                <span className="block text-[10px] font-semibold text-green-600 uppercase tracking-wide">
                  Card created ✓
                </span>
                <span className="block text-xs font-medium text-gray-700">{popup.card.front}</span>
                <LatexText text={popup.card.back} className="text-gray-500 text-xs leading-relaxed block" />
                <a
                  href={`/srs/${popup.card.deckId}/cards/${popup.card.id}`}
                  className="block text-[11px] text-indigo-600 hover:text-indigo-800 font-medium pt-1 border-t border-gray-50"
                >
                  Open card →
                </a>
              </span>
            )}

            {popup?.phase === 'error' && (
              <span className="block text-xs text-red-500">{popup.message}</span>
            )}
          </span>
        </span>
      )}
    </span>
  )
}

// ── WikiText — public component ────────────────────────────────────────────────

/**
 * Renders text with [[wikilink]] support layered on top of LatexText.
 *
 * @param text     The raw card text, may contain [[term]] tokens and LaTeX
 * @param deckId   The current card's deck — used when generating stub cards
 * @param context  The full card front+back — passed to Claude for domain context
 * @param className Optional wrapper class
 */
export function WikiText({
  text,
  deckId,
  context = '',
  className,
}: {
  text:       string
  deckId:     string
  context?:   string
  className?: string
}) {
  // Split on [[...]] — odd indices are linked terms, even are plain text
  const parts = text.split(/\[\[([^\]]+)\]\]/)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 0
          ? <LatexText key={i} text={part} />
          : <WikiLink key={i} term={part} deckId={deckId} cardContext={context} />
      )}
    </span>
  )
}
