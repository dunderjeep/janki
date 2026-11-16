'use client'

import { Fragment, type ReactNode } from 'react'

/**
 * A very small Markdown renderer for the thinking-tool output.
 *
 * Deliberately not a dependency. The model emits a narrow subset here —
 * headings, bullets, bold, inline code — and the alternative was showing the
 * raw `**asterisks**` and backticks, which is what it did before. A parser for
 * arbitrary Markdown would be a large amount of code and a supply-chain
 * decision to render six kinds of line.
 *
 * Anything it does not recognise falls through as plain text, so the worst case
 * is what you had.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}:${i}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="px-1 py-0.5 rounded bg-gray-200/70 text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: ReactNode[] = []

  const flush = () => {
    if (list.length === 0) return
    out.push(
      <ul key={`ul${out.length}`} className="list-disc pl-4 space-y-0.5 my-1">{list}</ul>
    )
    list = []
  }

  lines.forEach((line, i) => {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      out.push(
        <div key={i} className="font-semibold text-gray-900 mt-2 first:mt-0">
          {inline(heading[2], String(i))}
        </div>
      )
      return
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(<li key={i}>{inline(bullet[1], String(i))}</li>)
      return
    }

    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (numbered) {
      list.push(<li key={i}>{inline(numbered[1], String(i))}</li>)
      return
    }

    flush()
    if (line.trim() === '') {
      out.push(<div key={i} className="h-1.5" />)
    } else {
      out.push(<p key={i} className="my-0.5">{inline(line, String(i))}</p>)
    }
  })

  flush()
  return <div className="leading-snug">{out}</div>
}
