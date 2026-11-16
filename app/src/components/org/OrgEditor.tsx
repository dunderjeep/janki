'use client'

/**
 * Org text in CodeMirror, made pleasant the way org-mode makes it pleasant:
 *   - headings sized by level, TODO/DONE coloured;
 *   - `- [ ]` checkboxes are real checkboxes: click to tick;
 *   - [[id:…][description]] links show only their description until the cursor
 *     goes into them, and Ctrl/Cmd+click follows one;
 *   - property drawers, planning lines and #+ keywords are dimmed;
 *   - Ctrl/Cmd+K asks for a note and inserts a link to it (org-roam-node-insert).
 * The text is the org text, unchanged: what you type is what is saved.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { EditorState, RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, placeholder, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'

const HEADING = /^(\*+)\s+(?:(TODO|NEXT|WAIT|HOLD|SOMEDAY|DONE|CANCELLED)\s+)?/
const CHECKBOX = /^(\s*[-+*]\s+)\[([ Xx-])\]/
const LINK = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g
const DIM = /^\s*(:[A-Za-z_+-]+:.*|#\+.*|(SCHEDULED|DEADLINE|CLOSED):.*)$/

const theme = EditorView.theme({
  '&': { fontSize: '16px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", lineHeight: '1.65' },
  '.cm-content': { padding: '1rem 0 40vh', caretColor: '#0369a1' },
  '.cm-cursor': { borderLeftColor: '#0369a1', borderLeftWidth: '2px' },
  '.org-h1': { fontSize: '1.3em', fontWeight: '700' },
  '.org-h2': { fontSize: '1.12em', fontWeight: '650' },
  '.org-h3, .org-h4': { fontWeight: '600' },
  '.org-todo': { color: '#b91c1c', fontWeight: '600', fontSize: '0.85em' },
  '.org-done': { color: '#15803d', fontWeight: '600', fontSize: '0.85em' },
  '.org-dim': { color: '#9ca3af', fontSize: '0.85em' },
  '.org-link': { color: '#0369a1', textDecoration: 'underline', textDecorationColor: '#bae6fd', cursor: 'pointer' },
  '.org-checked': { color: '#9ca3af', textDecoration: 'line-through' },
  '.org-box': { margin: '0 0.35em 0 0', verticalAlign: '-0.1em', cursor: 'pointer', accentColor: '#0369a1' },
})

/**
 * The change that keeps the heading's [3/15] or [20%] cookie true once the box
 * at `at` is ticked (`on`) or unticked, as org does. Nothing if the heading has none.
 */
function cookieChange(view: EditorView, at: number, on: boolean): { from: number; to: number; insert: string }[] {
  const doc = view.state.doc
  const here = doc.lineAt(at).number
  let h = here
  while (h >= 1 && !/^\*+\s/.test(doc.line(h).text)) h--
  if (h < 1) return []
  const head = doc.line(h)
  const cookie = /\[(\d+\/\d+|\d+%)\]/.exec(head.text)
  if (!cookie) return []
  let done = 0
  let total = 0
  for (let n = h + 1; n <= doc.lines && !/^\*+\s/.test(doc.line(n).text); n++) {
    const m = CHECKBOX.exec(doc.line(n).text)
    if (!m) continue
    total++
    const ticked = n === here ? on : m[2] === 'X' || m[2] === 'x'
    if (ticked) done++
  }
  const text = cookie[1].includes('/') ? `[${done}/${total}]` : `[${total ? Math.round((100 * done) / total) : 0}%]`
  const from = head.from + cookie.index
  return [{ from, to: from + cookie[0].length, insert: text }]
}

class Checkbox extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super() }
  eq(o: Checkbox) { return o.checked === this.checked && o.pos === this.pos }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'org-box'
    box.onmousedown = (e) => e.preventDefault()
    box.onclick = (e) => {
      e.preventDefault()
      const at = this.pos + 1 // the character between the brackets
      view.dispatch({ changes: [{ from: at, to: at + 1, insert: this.checked ? ' ' : 'X' }, ...cookieChange(view, at, !this.checked)] })
    }
    return box
  }
  ignoreEvent() { return false }
}

/** Where the cursor is: a link or checkbox it is inside shows as plain text, for editing. */
function cursorIn(view: EditorView, from: number, to: number) {
  return view.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

function decorate(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos)
      const text = line.text
      const marks: { from: number; to: number; deco: Decoration }[] = []
      const h = HEADING.exec(text)
      if (h) {
        marks.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `org-h${Math.min(h[1].length, 4)}` }) })
        if (h[2]) {
          const at = line.from + text.indexOf(h[2], h[1].length)
          marks.push({ from: at, to: at + h[2].length, deco: Decoration.mark({ class: /DONE|CANCELLED/.test(h[2]) ? 'org-done' : 'org-todo' }) })
        }
      } else if (DIM.test(text)) {
        marks.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'org-dim' }) })
      }
      const c = CHECKBOX.exec(text)
      if (c) {
        const boxFrom = line.from + c[1].length
        const checked = c[2] === 'X' || c[2] === 'x'
        if (!cursorIn(view, boxFrom, boxFrom + 3)) {
          marks.push({ from: boxFrom, to: boxFrom + 3, deco: Decoration.replace({ widget: new Checkbox(checked, boxFrom) }) })
        }
        if (checked) marks.push({ from: boxFrom + 3, to: line.to, deco: Decoration.mark({ class: 'org-checked' }) })
      }
      for (const m of text.matchAll(LINK)) {
        const start = line.from + m.index!
        const end = start + m[0].length
        const desc = m[2]
        if (desc && !cursorIn(view, start, end)) {
          const descFrom = start + 2 + m[1].length + 2
          marks.push({ from: start, to: descFrom, deco: Decoration.replace({}) })
          marks.push({ from: descFrom, to: descFrom + desc.length, deco: Decoration.mark({ class: 'org-link', attributes: { 'data-target': m[1] } }) })
          marks.push({ from: descFrom + desc.length, to: end, deco: Decoration.replace({}) })
        } else {
          marks.push({ from: start, to: end, deco: Decoration.mark({ class: 'org-link', attributes: { 'data-target': m[1] } }) })
        }
      }
      marks.sort((x, y) => x.from - y.from || x.to - y.to)
      for (const m of marks) b.add(m.from, m.to, m.deco)
      pos = line.to + 1
    }
  }
  return b.finish()
}

const orgLook = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = decorate(view) }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = decorate(u.view)
  }
}, { decorations: (v) => v.decorations })

export type OrgEditorHandle = {
  /** Inserts text at the cursor, replacing any selection. */
  insert: (text: string) => void
  focus: () => void
  /** Replaces the whole text, keeping the cursor where it can. */
  setText: (text: string) => void
}

const OrgEditor = forwardRef<OrgEditorHandle, {
  initial: string
  onChange: (text: string) => void
  /** Ctrl/Cmd+K: asked to insert a link. */
  onLinkRequest?: () => void
  /** Ctrl/Cmd+click on a link: its target, such as "id:…" or "https://…". */
  onFollow?: (target: string) => void
  onSave?: () => void
  placeholderText?: string
}>(function OrgEditor({ initial, onChange, onLinkRequest, onFollow, onSave, placeholderText }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const handlers = useRef({ onChange, onLinkRequest, onFollow, onSave })
  handlers.current = { onChange, onLinkRequest, onFollow, onSave }

  useEffect(() => {
    const extensions: Extension[] = [
      history(),
      keymap.of([
        { key: 'Mod-k', run: () => { handlers.current.onLinkRequest?.(); return true } },
        { key: 'Mod-s', run: () => { handlers.current.onSave?.(); return true } },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.lineWrapping,
      placeholder(placeholderText ?? ''),
      theme,
      orgLook,
      EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()) }),
      EditorView.domEventHandlers({
        click: (e) => {
          const el = (e.target as HTMLElement).closest('.org-link') as HTMLElement | null
          if (!el || !(e.ctrlKey || e.metaKey)) return false
          e.preventDefault()
          handlers.current.onFollow?.(el.dataset.target ?? '')
          return true
        },
      }),
    ]
    const v = new EditorView({ state: EditorState.create({ doc: initial, extensions }), parent: host.current! })
    view.current = v
    return () => v.destroy()
    // The editor is made once; `initial` is only its starting text. setText replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    insert: (text) => {
      const v = view.current
      if (!v) return
      const { from, to } = v.state.selection.main
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
      v.focus()
    },
    focus: () => view.current?.focus(),
    setText: (text) => {
      const v = view.current
      if (!v || v.state.doc.toString() === text) return
      const at = Math.min(v.state.selection.main.head, text.length)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: at } })
    },
  }), [])

  return <div ref={host} className="min-h-[60vh]" />
})

export default OrgEditor
