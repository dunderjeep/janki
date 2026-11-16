'use client'

import { Fragment, type ReactNode } from 'react'

/**
 * Just enough org to read a note on the canvas.
 *
 * Not a full org parser and not trying to be one: headings, lists, checkboxes,
 * description terms, blocks and links cover what notes are actually made of.
 * Everything else falls through as plain text, which is always readable.
 *
 * The one thing that matters is links. An `id:` link is a step along the graph,
 * so it is a button that takes you there rather than text to copy.
 */

const LINK = /\[\[([^\]]+)\](?:\[([^\]]+)\])?\]/g
const EMPHASIS = /(^|[\s(])(\*[^*\s][^*]*?\*|=[^=\s][^=]*?=|~[^~\s][^~]*?~)(?=$|[\s.,;:!?)])/g
const TODO = /^(TODO|NEXT|WAIT|WAITING|DONE|CANCELLED|CANCELED|HOLD)\s+/

type Follow = { onFollow: (id: string) => void; known: (id: string) => boolean }

function emphasis(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(EMPHASIS)) {
    const start = m.index! + m[1].length
    out.push(text.slice(last, start))
    const body = m[2].slice(1, -1)
    const k = `${key}e${i++}`
    out.push(m[2][0] === '*'
      ? <strong key={k}>{body}</strong>
      : <code key={k} className="text-[11px] bg-gray-100 rounded px-0.5">{body}</code>)
    last = start + m[2].length
  }
  out.push(text.slice(last))
  return out
}

function inline(text: string, f: Follow, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(LINK)) {
    out.push(...emphasis(text.slice(last, m.index), `${key}t${i}`))
    const [target, desc] = [m[1], m[2] ?? m[1]]
    const k = `${key}l${i++}`
    if (target.startsWith('id:')) {
      const id = target.slice(3)
      out.push(f.known(id)
        ? <button key={k} onClick={() => f.onFollow(id)}
            className="text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600">
            {desc}
          </button>
        // A dangling id, or a heading org-roam never indexed: nowhere to go.
        : <span key={k} className="text-gray-500 underline decoration-dotted" title="Not on the graph">{desc}</span>)
    } else if (/^https?:/.test(target)) {
      out.push(<a key={k} href={target} target="_blank" rel="noreferrer"
        className="text-sky-700 underline decoration-sky-300">{desc}</a>)
    } else {
      out.push(<span key={k} className="text-gray-600" title={target}>{desc}</span>)
    }
    last = m.index! + m[0].length
  }
  out.push(...emphasis(text.slice(last), `${key}t${i}`))
  return out
}

export default function OrgText({ text, onFollow, known }: { text: string } & Follow) {
  const f = { onFollow, known }
  const lines = text.split('\n')
  const out: ReactNode[] = []

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]
    const key = `L${n}`

    // Drawers are machinery — the ID lives there — not something to read.
    if (/^\s*:[A-Z]+:\s*$/.test(line) && !/^\s*:END:\s*$/.test(line)) {
      while (n < lines.length && !/^\s*:END:\s*$/.test(lines[n])) n++
      continue
    }

    const block = /^\s*#\+begin_(\w+)/i.exec(line)
    if (block) {
      const body: string[] = []
      n++
      while (n < lines.length && !/^\s*#\+end_/i.test(lines[n])) body.push(lines[n++])
      out.push(
        <pre key={key} className={`text-[11px] rounded px-2 py-1 my-1 whitespace-pre-wrap ${
          block[1].toLowerCase() === 'quote' ? 'border-l-2 border-gray-300 italic text-gray-600' : 'bg-gray-50 font-mono'
        }`}>{body.join('\n')}</pre>
      )
      continue
    }

    if (/^#\+\w+:/.test(line) || /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(line)) continue

    const heading = /^(\*+)\s+(.*)$/.exec(line)
    if (heading) {
      let title = heading[2]
      const todo = TODO.exec(title)
      if (todo) title = title.slice(todo[0].length)
      const tags = /\s+(:[\w@#%:]+:)\s*$/.exec(title)
      if (tags) title = title.slice(0, tags.index)
      const level = heading[1].length
      out.push(
        <div key={key} className={`font-semibold text-gray-900 mt-2 ${level === 1 ? 'text-[13px]' : 'text-xs'}`}>
          {todo && <span className={`text-[9px] font-bold mr-1 ${todo[1] === 'DONE' ? 'text-gray-400' : 'text-rose-600'}`}>{todo[1]}</span>}
          {inline(title, f, key)}
          {tags && <span className="ml-1 text-[9px] font-normal text-gray-400">{tags[1]}</span>}
        </div>
      )
      continue
    }

    const item = /^(\s*)([-+*]|\d+[.)])\s+(?:\[([ Xx-])\]\s+)?(.*)$/.exec(line)
    if (item) {
      const [, indent, bullet, box, rest] = item
      const term = /^(.+?)\s+::\s+(.*)$/.exec(rest)
      out.push(
        <div key={key} className="flex gap-1.5 text-xs leading-relaxed"
          style={{ paddingLeft: indent.replace(/\t/g, '  ').length * 6 }}>
          <span className="text-gray-400 flex-shrink-0 w-3 text-right">
            {box !== undefined ? (box === ' ' ? '☐' : box === '-' ? '◩' : '☑') : /\d/.test(bullet) ? bullet : '•'}
          </span>
          <span className={`min-w-0 ${box === 'X' || box === 'x' ? 'text-gray-400 line-through' : ''}`}>
            {term
              ? <><span className="text-indigo-700 font-medium">{term[1]}</span>
                  <span className="text-gray-300"> · </span>{inline(term[2], f, key)}</>
              : inline(rest, f, key)}
          </span>
        </div>
      )
      continue
    }

    if (/^\s*\|/.test(line)) {
      out.push(<div key={key} className="font-mono text-[11px] whitespace-pre text-gray-700 overflow-x-auto">{line}</div>)
      continue
    }

    if (!line.trim()) {
      out.push(<div key={key} className="h-2" />)
      continue
    }

    out.push(<p key={key} className="text-xs leading-relaxed text-gray-800">{inline(line, f, key)}</p>)
  }

  return <Fragment>{out}</Fragment>
}
