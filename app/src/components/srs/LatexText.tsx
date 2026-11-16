'use client'

import katex from 'katex'
import 'katex/dist/katex.min.css'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// ── LaTeX segment parser ───────────────────────────────────────────────────

type Segment =
  | { type: 'text'; content: string }
  | { type: 'display' | 'inline'; content: string }
  | { type: 'code-block'; lang: string; content: string }
  | { type: 'code-inline'; content: string }

function parse(rawText: string): Segment[] {
  // Normalize literal \n (two chars: backslash + n) to real newlines so that
  // fenced code blocks stored via JSON always parse correctly.
  const text = rawText.replace(/\\n(?![a-zA-Z])/g, '\n')
  const segments: Segment[] = []
  // Priority order — code fences first so backticks don't confuse math parser:
  //   ```lang\n...\n```   fenced code block
  //   `...`               inline code
  //   $$...$$             display math (dollar)
  //   \[...\]             display math (bracket)
  //   $...$               inline math (dollar)
  //   \(...\)             inline math (paren)
  const re = /(```(\w*)\n([\s\S]*?)```|`([^`\n]+)`|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]*?\$|\\\([\s\S]*?\\\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', content: text.slice(last, m.index) })
    const full = m[0]
    if (full.startsWith('```')) {
      segments.push({ type: 'code-block', lang: m[2] ?? '', content: m[3] ?? '' })
    } else if (full.startsWith('`')) {
      segments.push({ type: 'code-inline', content: m[4] ?? full.slice(1, -1) })
    } else if (full.startsWith('$$')) {
      segments.push({ type: 'display', content: full.slice(2, -2) })
    } else if (full.startsWith('\\[')) {
      segments.push({ type: 'display', content: full.slice(2, -2) })
    } else if (full.startsWith('\\(')) {
      segments.push({ type: 'inline', content: full.slice(2, -2) })
    } else {
      segments.push({ type: 'inline', content: full.slice(1, -1) })
    }
    last = m.index + full.length
  }
  if (last < text.length) segments.push({ type: 'text', content: text.slice(last) })
  return segments
}

// ── Code renderers ─────────────────────────────────────────────────────────

function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
  }
  return hljs.highlightAuto(code).value
}

function renderMath(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode: display, throwOnError: false })
  } catch {
    return latex
  }
}

// ── Markdown table helpers ─────────────────────────────────────────────────

function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 2
}

// e.g. |---|:---:|---|
function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-|:]+\|$/.test(line.trim())
}

function parseCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

// ── Text segment renderer (handles newlines + tables) ─────────────────────
//
// After repairLatexJson + JSON.parse, newlines may be the literal two-char
// sequence \+n (char codes 92, 110) rather than a real newline character.
// We split on both so tables and line breaks always work.

type Block =
  | { kind: 'text';  lines: string[] }
  | { kind: 'table'; lines: string[] }
  | { kind: 'ul';    lines: string[] }
  | { kind: 'ol';    lines: string[] }

function isUlLine(line: string): boolean {
  return /^(\s*)([-*+])\s+/.test(line)
}
function isOlLine(line: string): boolean {
  return /^(\s*)\d+[.)]\s+/.test(line)
}
function ulContent(line: string): string {
  return line.replace(/^(\s*)([-*+])\s+/, '')
}
function olContent(line: string): string {
  return line.replace(/^(\s*)\d+[.)]\s+/, '')
}

// Render a single line of plain text, handling **bold** and *italic* inline
function InlineLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function lineKind(line: string): 'ul' | 'ol' | 'table' | 'text' {
  if (isTableRow(line) || isSeparatorRow(line)) return 'table'
  if (isUlLine(line)) return 'ul'
  if (isOlLine(line)) return 'ol'
  return 'text'
}

function TextSegment({ content }: { content: string }) {
  // Split on real newline OR literal \n (backslash + n)
  const lines = content.split(/\n|\\n/)

  // Fast path: no special lines
  if (!lines.some(l => lineKind(l) !== 'text')) {
    return (
      <span>
        {lines.map((line, i) => (
          <span key={i}><InlineLine text={line} />{i < lines.length - 1 && <br />}</span>
        ))}
      </span>
    )
  }

  // Group consecutive same-kind lines into blocks
  const blocks: Block[] = []
  let cur: Block = { kind: 'text', lines: [] }

  for (const line of lines) {
    const k = lineKind(line)
    if (k !== cur.kind) {
      if (cur.lines.length) blocks.push(cur)
      cur = { kind: k, lines: [line] }
    } else {
      cur.lines.push(line)
    }
  }
  if (cur.lines.length) blocks.push(cur)

  return (
    <span>
      {blocks.map((block, bi) => {
        if (block.kind === 'ul') {
          return (
            <ul key={bi} className="list-disc list-outside pl-5 my-2 space-y-1 text-left">
              {block.lines.map((line, i) => (
                <li key={i}><InlineLine text={ulContent(line)} /></li>
              ))}
            </ul>
          )
        }

        if (block.kind === 'ol') {
          return (
            <ol key={bi} className="list-decimal list-outside pl-5 my-2 space-y-1 text-left">
              {block.lines.map((line, i) => (
                <li key={i}><InlineLine text={olContent(line)} /></li>
              ))}
            </ol>
          )
        }

        if (block.kind === 'text') {
          return (
            <span key={bi}>
              {block.lines.map((line, i) => (
                <span key={i}><InlineLine text={line} />{i < block.lines.length - 1 && <br />}</span>
              ))}
            </span>
          )
        }

        // Table block — strip separator rows, split into header + body
        const dataRows = block.lines.filter(l => isTableRow(l) && !isSeparatorRow(l))
        if (dataRows.length < 1) return <span key={bi}>{block.lines.join(' ')}</span>

        const [headerRow, ...bodyRows] = dataRows
        const headers = parseCells(headerRow)

        return (
          <table key={bi} className="w-full text-sm border-collapse my-3 text-left">
            <thead>
              <tr>
                {headers.map((h, ci) => (
                  <th key={ci} className="border border-gray-300 bg-gray-50 px-3 py-1.5 font-semibold whitespace-nowrap">
                    <LatexText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-gray-50/50' : ''}>
                  {parseCells(row).map((cell, ci) => (
                    <td key={ci} className="border border-gray-300 px-3 py-1.5">
                      <LatexText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      })}
    </span>
  )
}

// ── Public component ───────────────────────────────────────────────────────

export function LatexText({ text, className }: { text: string; className?: string }) {
  const segments = parse(text)
  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <TextSegment key={i} content={seg.content} />

        if (seg.type === 'code-block') {
          return (
            <span key={i} className="block my-3">
              {seg.lang && (
                <span className="block text-xs text-gray-400 font-mono bg-gray-800 px-3 pt-2 pb-0 rounded-t-lg -mb-1 select-none">
                  {seg.lang}
                </span>
              )}
              <code
                className={`block overflow-x-auto whitespace-pre text-sm font-mono leading-relaxed p-3 ${seg.lang ? 'rounded-b-lg' : 'rounded-lg'}`}
                style={{ background: '#0d1117' }}
                dangerouslySetInnerHTML={{ __html: highlightCode(seg.content, seg.lang) }}
              />
            </span>
          )
        }

        if (seg.type === 'code-inline') {
          return (
            <code
              key={i}
              className="font-mono text-[0.875em] bg-gray-100 text-rose-600 px-1.5 py-0.5 rounded"
            >
              {seg.content}
            </code>
          )
        }

        const html = renderMath(seg.content, seg.type === 'display')
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
            className={seg.type === 'display' ? 'block my-2' : 'inline'}
          />
        )
      })}
    </span>
  )
}
