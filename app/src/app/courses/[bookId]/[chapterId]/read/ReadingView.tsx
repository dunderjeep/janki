'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { courseSectionBlocks, courseAnnotations } from '@/db/schema/janki'

type Block = typeof courseSectionBlocks.$inferSelect & {
  annotations: (typeof courseAnnotations.$inferSelect)[]
}
type Section = {
  id: string; number: string; title: string
  blocks: Block[]
}

type Props = {
  sections: Section[]
  bookId: string
  chapterId: string
  uid: string
}

// ── Selection popover state ───────────────────────────────────────────────────
type SelectionState = {
  blockId: string
  text: string
  offsetStart: number
  offsetEnd: number
  x: number
  y: number
}

// ── Clarification state ───────────────────────────────────────────────────────
type ClarifyState = {
  blockId: string
  contextText: string
  x: number
  y: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Block renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderBlockContent(block: Block): React.ReactNode {
  // Sanitise: we trust our own epub-extracted HTML (no user input)
  // but strip any script/style tags for safety
  const safeHtml = block.html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  if (block.kind === 'figure') {
    return (
      <figure className="my-4 text-center">
        {block.imageRef && (
          <img
            src={`/api/courses/epub-image?path=${encodeURIComponent(block.imageRef)}`}
            alt={block.textContent || 'Figure'}
            className="inline-block max-w-full rounded"
          />
        )}
        {block.textContent && (
          <figcaption className="text-sm text-gray-500 mt-2 italic">{block.textContent}</figcaption>
        )}
      </figure>
    )
  }

  if (block.kind === 'equation') {
    if (block.imageRef) {
      return (
        <img
          src={`/api/courses/epub-image?path=${encodeURIComponent(block.imageRef)}`}
          alt="equation"
          className="inline-block my-1 max-h-8"
        />
      )
    }
    return <span className="font-mono text-gray-700">{block.textContent}</span>
  }

  // For text blocks use dangerouslySetInnerHTML to preserve italic/bold math
  return <span dangerouslySetInnerHTML={{ __html: safeHtml }} />
}

function BlockWrapper({
  block,
  onSelect,
  onAskClaude,
}: {
  block: Block
  onSelect: (s: SelectionState) => void
  onAskClaude: (s: ClarifyState) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const hasAnnotations = block.annotations.length > 0

  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !ref.current) return
    const text = sel.toString().trim()
    if (!text || text.length < 3) return

    // Compute character offset within textContent
    const blockText = block.textContent
    const idx = blockText.indexOf(text)
    if (idx === -1) return

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    onSelect({
      blockId: block.id,
      text,
      offsetStart: idx,
      offsetEnd: idx + text.length,
      x: rect.left + rect.width / 2,
      y: rect.bottom + window.scrollY + 8,
    })
  }

  const blockCls = {
    para:        'text-gray-800 leading-relaxed',
    indented:    'text-gray-700 leading-relaxed pl-6 border-l-2 border-gray-200 italic',
    example:     'text-gray-800 leading-relaxed',
    definition:  'text-gray-800 leading-relaxed',
    theorem:     'text-gray-800 leading-relaxed',
    list_item:   'text-gray-700 leading-relaxed pl-4',
    equation:    'text-gray-700 my-2',
    figure:      '',
  }[block.kind] ?? 'text-gray-800 leading-relaxed'

  return (
    <div
      ref={ref}
      className={`relative group ${hasAnnotations ? 'bg-amber-50/40' : ''}`}
      onMouseUp={handleMouseUp}
    >
      {block.kind === 'example' && block.label && (
        <span className="font-bold text-gray-900 mr-1">{block.label}.</span>
      )}

      <span className={blockCls}>
        {renderBlockContent(block)}
      </span>

      {/* Ask Claude button — appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onAskClaude({
            blockId: block.id,
            contextText: block.textContent,
            x: rect.left,
            y: rect.bottom + window.scrollY + 8,
          })
        }}
        className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg shadow-sm ml-2"
        title="Ask Claude to clarify this"
      >
        Ask Claude
      </button>

      {/* Annotation dots */}
      {hasAnnotations && (
        <div className="flex gap-1 mt-1">
          {block.annotations.map(a => (
            <span
              key={a.id}
              title={a.note || a.selectedText}
              className="inline-block w-2 h-2 rounded-full bg-amber-400"
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReadingView({ sections, bookId, chapterId, uid }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [highlightNote, setHighlightNote] = useState('')
  const [savingHighlight, setSavingHighlight] = useState(false)

  const [clarify, setClarify] = useState<ClarifyState | null>(null)
  const [clarifyQuestion, setClarifyQuestion] = useState('')
  const [clarifyAnswer, setClarifyAnswer] = useState('')
  const [clarifyLoading, setClarifyLoading] = useState(false)

  function dismissAll() {
    setSelection(null)
    setHighlightNote('')
    setClarify(null)
    setClarifyQuestion('')
    setClarifyAnswer('')
  }

  // ── Save highlight ──────────────────────────────────────────────────────────
  async function saveHighlight() {
    if (!selection) return
    setSavingHighlight(true)
    try {
      await fetch(`/api/courses/${bookId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId:      selection.blockId,
          offsetStart:  selection.offsetStart,
          offsetEnd:    selection.offsetEnd,
          selectedText: selection.text,
          note:         highlightNote,
        }),
      })
      setSelection(null)
      setHighlightNote('')
      startTransition(() => router.refresh())
    } finally {
      setSavingHighlight(false)
    }
  }

  // ── Ask Claude ──────────────────────────────────────────────────────────────
  async function askClaude() {
    if (!clarify || !clarifyQuestion.trim()) return
    setClarifyLoading(true)
    setClarifyAnswer('')
    try {
      const res = await fetch(`/api/courses/${bookId}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId:     clarify.blockId,
          contextText: clarify.contextText,
          question:    clarifyQuestion,
        }),
      })
      const data = await res.json()
      setClarifyAnswer(data.answer ?? data.error ?? 'No response.')
    } finally {
      setClarifyLoading(false)
    }
  }

  return (
    <div onClick={() => dismissAll()}>
      {sections.map((section, si) => (
        <section key={section.id} className="mb-12">
          {/* Section heading */}
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-3 pb-2 border-b border-gray-100">
            <span className="text-gray-400 font-normal">{section.number}</span>
            {section.title}
          </h2>

          {section.blocks.length === 0 ? (
            <p className="text-gray-300 text-sm italic">No content for this section.</p>
          ) : (
            <div className="space-y-4">
              {section.blocks.map(block => (
                <BlockWrapper
                  key={block.id}
                  block={block}
                  onSelect={s => { dismissAll(); setSelection(s) }}
                  onAskClaude={s => { dismissAll(); setClarify(s) }}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ── Highlight popover ───────────────────────────────────────────────── */}
      {selection && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-80"
          style={{ left: Math.min(selection.x - 160, window.innerWidth - 340), top: selection.y }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-amber-600 mb-2">Highlight</p>
          <p className="text-sm text-gray-700 italic mb-3 line-clamp-2">"{selection.text}"</p>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400"
            rows={2}
            placeholder="Add a note (optional)…"
            value={highlightNote}
            onChange={e => setHighlightNote(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={saveHighlight}
              disabled={savingHighlight}
              className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold py-1.5 rounded-lg transition-colors"
            >
              {savingHighlight ? 'Saving…' : 'Save highlight'}
            </button>
            <button onClick={dismissAll} className="text-sm text-gray-400 hover:text-gray-600 px-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Ask Claude popover ──────────────────────────────────────────────── */}
      {clarify && (
        <div
          className="fixed z-50 bg-white border border-indigo-200 rounded-xl shadow-lg p-4 w-96"
          style={{ left: Math.min(clarify.x, window.innerWidth - 420), top: clarify.y }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-indigo-600 mb-1">Ask Claude</p>
          <p className="text-xs text-gray-400 mb-3 line-clamp-2 italic">
            Context: {clarify.contextText.slice(0, 100)}…
          </p>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-400"
            rows={3}
            placeholder="What's confusing? e.g. 'Why does this argument form work?'"
            value={clarifyQuestion}
            onChange={e => setClarifyQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) askClaude() }}
            autoFocus
          />
          {clarifyAnswer && (
            <div className="mt-3 p-3 bg-indigo-50 rounded-lg text-sm text-gray-800 leading-relaxed max-h-64 overflow-y-auto">
              {clarifyAnswer}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={askClaude}
              disabled={clarifyLoading || !clarifyQuestion.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-1.5 rounded-lg transition-colors"
            >
              {clarifyLoading ? 'Thinking…' : 'Ask (⌘↵)'}
            </button>
            <button onClick={dismissAll} className="text-sm text-gray-400 hover:text-gray-600 px-2">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
