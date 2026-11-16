'use client'

/**
 * The writing surface: CodeMirror with Markdown styled as it is typed.
 * Lines that exist only to preserve Org (drawers, planning lines, keywords)
 * collapse into a small marker and cannot be edited by accident.
 */
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, EditorState, RangeSetBuilder, StateField, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, placeholder, WidgetType } from '@codemirror/view'
import { tags } from '@lezer/highlight'
// Lines Scatterbrain hides (org syntax kept as comments); Joblowski documents rarely have any.
const HIDDEN = /^\s*<!--org (.*) -->\s*$/
const isHiddenLine = (line: string) => HIDDEN.test(line)

const prose = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"

const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '700' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '700' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#6d28d9' },
  { tag: tags.url, color: '#9ca3af' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', fontSize: '0.88em', color: '#7c2d12' },
  { tag: tags.quote, color: '#4b5563', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#c4b5d0' },
])

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '18px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: prose, lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { maxWidth: '42rem', margin: '0 auto', padding: '3rem 1.5rem 40vh', caretColor: '#6d28d9' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: '#6d28d9', borderLeftWidth: '2px' },
  '.sb-org-marker': {
    display: 'block', width: 'fit-content', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '11px', lineHeight: '1.5',
    color: '#9ca3af', userSelect: 'none',
  },
})

class OrgMarker extends WidgetType {
  constructor(readonly lines: number) {
    super()
  }
  eq(other: OrgMarker) {
    return other.lines === this.lines
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'sb-org-marker'
    el.textContent = `· org details kept (${this.lines} line${this.lines === 1 ? '' : 's'}) ·`
    el.title = 'Properties, schedules and keywords from the Org file. Saved unchanged.'
    return el
  }
}

function hiddenRanges(doc: Text): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let from = -1
  let to = -1
  let count = 0
  const flush = () => {
    if (count) builder.add(from, to, Decoration.replace({ block: true, widget: new OrgMarker(count) }))
    count = 0
  }
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    if (isHiddenLine(line.text)) {
      if (!count) from = line.from
      to = line.to
      count++
    } else flush()
  }
  flush()
  return builder.finish()
}

const orgLines = StateField.define<DecorationSet>({
  create: (state) => hiddenRanges(state.doc),
  update: (value, tr) => (tr.docChanged ? hiddenRanges(tr.state.doc) : value),
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
})

function wrap(view: EditorView, mark: string): boolean {
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: [{ from: range.from, insert: mark }, { from: range.to, insert: mark }],
      range: range.empty
        ? EditorSelection.cursor(range.from + mark.length)
        : EditorSelection.range(range.from + mark.length, range.to + mark.length),
    })),
  )
  view.focus()
  return true
}

/** Sets or clears a line prefix on each line of the selection. */
function prefix(view: EditorView, mark: string): boolean {
  const { state } = view
  const seen = new Set<number>()
  const changes: { from: number; to?: number; insert?: string }[] = []
  for (const range of state.selection.ranges) {
    for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const line = state.doc.line(n)
      if (line.text.startsWith(mark)) changes.push({ from: line.from, to: line.from + mark.length })
      else changes.push({ from: line.from, insert: mark })
    }
  }
  view.dispatch({ changes })
  view.focus()
  return true
}

export type EditorCommands = {
  bold(): void
  italic(): void
  heading(): void
  quote(): void
  list(): void
}

export default function MarkdownEditor({ value, onChange, onReady }: {
  /** Read once: remount with a new key to load different text. */
  value: string
  onChange: (text: string) => void
  onReady?: (commands: EditorCommands) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const changed = useRef(onChange)
  changed.current = onChange

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            { key: 'Mod-b', run: (v) => wrap(v, '**') },
            { key: 'Mod-i', run: (v) => wrap(v, '*') },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdown(),
          syntaxHighlighting(highlight),
          orgLines,
          EditorView.lineWrapping,
          placeholder('Start writing…'),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.focus()
    onReady?.({
      bold: () => wrap(view, '**'),
      italic: () => wrap(view, '*'),
      heading: () => prefix(view, '## '),
      quote: () => prefix(view, '> '),
      list: () => prefix(view, '- '),
    })
    return () => view.destroy()
    // The text is deliberately read only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="h-full" />
}
