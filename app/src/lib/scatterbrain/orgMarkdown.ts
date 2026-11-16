/**
 * Org <-> Markdown, one line for one line.
 *
 * Org files are edited here as Markdown but stay Org on disk, and they are
 * somebody's real notes, so the conversion has one rule above fidelity to either
 * format: a line you did not touch comes back byte for byte. markdownToOrg gets
 * the file's previous text and reuses the original Org for every Markdown line
 * that still reads the same. Only lines you actually edited are converted.
 *
 * That only works because every Org line becomes exactly one Markdown line.
 * Anything Markdown has no form for (drawers, planning lines, #+KEYWORDS, Org
 * comments) becomes a `<!--org ... -->` line, which the editor collapses.
 */

const HIDDEN = /^\s*<!--org (.*) -->\s*$/
const hide = (line: string) => `<!--org ${line} -->`

export const isHiddenLine = (line: string) => HIDDEN.test(line)

/** The file's title and properties, kept out of the editor. */
export function splitPreamble(org: string): { preamble: string; body: string; title: string | null } {
  const lines = org.split('\n')
  let i = 0
  let title: string | null = null
  let inDrawer = false
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (inDrawer) {
      if (/^\s*:END:\s*$/i.test(line)) inDrawer = false
      continue
    }
    if (/^\s*$/.test(line)) continue
    if (/^\s*:PROPERTIES:\s*$/i.test(line)) {
      inDrawer = true
      continue
    }
    const keyword = /^#\+(\w+):(.*)$/.exec(line)
    if (!keyword) break
    if (keyword[1].toLowerCase() === 'title') title = keyword[2].trim()
  }
  if (inDrawer) return { preamble: '', body: org, title } // never closed: leave the text alone
  if (i === lines.length) return { preamble: org, body: '', title }
  const preamble = lines.slice(0, i).join('\n') + (i > 0 ? '\n' : '')
  return { preamble, body: lines.slice(i).join('\n'), title }
}

/** Puts a file back together. A title-only file may not end in a newline. */
export function joinPreamble(preamble: string, body: string): string {
  return preamble && body && !preamble.endsWith('\n') ? `${preamble}\n${body}` : preamble + body
}

/** Pulls code spans and links out so emphasis cannot reach inside them. */
function withHeld(text: string, hold: (held: (s: string) => string) => string): string {
  const spans: string[] = []
  const result = hold((s) => `\u0001${spans.push(s) - 1}\u0002`)
  const restore = (s: string): string =>
    s.replace(/\u0001(\d+)\u0002/g, (_, n) => restore(spans[Number(n)]))
  return restore(result)
}

const ORG_PRE = `(^|[\\s\\-('"{\\u0001])`
const ORG_POST = `(?=$|[\\s\\-.,:;!?'")}\\[\\u0002])`
const orgEmphasis = (mark: string) =>
  new RegExp(`${ORG_PRE}${mark}([^\\s${mark === '\\*' ? '*' : mark}](?:[^\\u0001\\u0002]*?[^\\s])?)${mark}${ORG_POST}`, 'g')

const ORG_BOLD = orgEmphasis('\\*')
const ORG_ITALIC = orgEmphasis('/')
const ORG_STRIKE = orgEmphasis('\\+')
const ORG_CODE = new RegExp(`${ORG_PRE}([=~])([^\\s](?:.*?[^\\s])?)\\2${ORG_POST}`, 'g')

function inlineOrgToMd(text: string): string {
  return withHeld(text, (held) => {
    let out = text
      .replace(ORG_CODE, (_, pre, _mark, code) => pre + held(`\`${code}\``))
      .replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, (_, target, label) => held(`[${label}](${target})`))
      .replace(/\[\[([^\]]+)\]\]/g, (_, target) => held(`[${target}](${target})`))
    out = out
      .replace(ORG_BOLD, (_, pre, body) => `${pre}\u0003${body}\u0003`)
      .replace(ORG_ITALIC, (_, pre, body) => `${pre}*${body}*`)
      .replace(ORG_STRIKE, (_, pre, body) => `${pre}~~${body}~~`)
    return out.replace(/\u0003/g, '**')
  })
}

function inlineMdToOrg(text: string): string {
  return withHeld(text, (held) => {
    let out = text
      .replace(/`([^`]+)`/g, (_, code) => held(`~${code}~`))
      .replace(/!?\[([^\]]*)\]\(([^)\s]+(?: [^)]*)?)\)/g, (_, label, target) =>
        held(!label || label === target ? `[[${target}]]` : `[[${target}][${label}]]`),
      )
    out = out
      .replace(/\*\*([^*\s](?:.*?[^*\s])?)\*\*/g, '\u0003$1\u0003')
      .replace(/(^|[^*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\*)/g, '$1/$2/')
      .replace(/~~([^~\s](?:.*?[^~\s])?)~~/g, '+$1+')
    return out.replace(/\u0003/g, '*')
  })
}

const isTableRule = (line: string) => /^\s*\|[-+:| ]*-[-+:| ]*\|?\s*$/.test(line)

type Block = null | { kind: 'code' } | { kind: 'quote' }

const LANGUAGE_BLOCKS = /^(\s*)#\+begin_(src|example)\b ?(.*)$/i

/** One Markdown line for every Org line, in order. */
function orgLinesToMd(body: string): string[] {
  const out: string[] = []
  let block: Block = null
  let inDrawer = false

  for (const line of body.split('\n')) {
    if (block?.kind === 'code') {
      const end = /^(\s*)#\+end_(src|example)\s*$/i.exec(line)
      if (end) {
        out.push(`${end[1]}\`\`\``)
        block = null
      } else out.push(line)
      continue
    }
    if (inDrawer) {
      out.push(hide(line))
      if (/^\s*:END:\s*$/i.test(line)) inDrawer = false
      continue
    }

    const open = LANGUAGE_BLOCKS.exec(line)
    if (open) {
      const language = open[2].toLowerCase() === 'example' ? 'example' : open[3].trim()
      // Header arguments (:results etc.) have no Markdown form.
      out.push(`${open[1]}\`\`\`${language}`)
      block = { kind: 'code' }
      continue
    }
    if (/^\s*#\+begin_quote\b/i.test(line)) {
      out.push(hide(line))
      block = { kind: 'quote' }
      continue
    }
    if (/^\s*#\+end_quote\b/i.test(line)) {
      out.push(hide(line))
      block = null
      continue
    }
    if (block?.kind === 'quote') {
      out.push(line.trim() ? `> ${inlineOrgToMd(line)}` : '>')
      continue
    }

    if (/^\s*:[-\w]+:\s*$/.test(line) && !/^\s*:END:\s*$/i.test(line)) {
      inDrawer = true
      out.push(hide(line))
      continue
    }
    if (/^\s*#\+/.test(line) || /^\s*#(\s|$)/.test(line) || /^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(line)) {
      out.push(hide(line))
      continue
    }

    const heading = /^(\*+) (.*)$/.exec(line)
    if (heading) {
      out.push(`${'#'.repeat(heading[1].length)} ${inlineOrgToMd(heading[2])}`)
      continue
    }
    if (/^\s*-{5,}\s*$/.test(line)) {
      out.push('---')
      continue
    }
    if (isTableRule(line) && line.includes('|')) {
      out.push(line.replace(/\+/g, '|'))
      continue
    }
    const listItem = /^(\s*(?:[-+]|\d+[.)])\s+|\s+\*\s+)(.*)$/.exec(line)
    if (listItem) {
      out.push(listItem[1] + inlineOrgToMd(listItem[2]))
      continue
    }
    out.push(inlineOrgToMd(line))
  }
  return out
}

/** The body of an Org file, as Markdown. */
export function orgToMarkdown(body: string): string {
  return orgLinesToMd(body).join('\n')
}

/** Converts a line nobody has seen as Org before. */
function mdLinesToOrg(lines: string[], keep: (line: string) => string | null): string[] {
  const out: string[] = []
  let inCode = false
  let keptFence = false
  let inHiddenQuote = false // a quote that came from a real #+begin_quote
  let inNewQuote = false
  let codeBlockName: 'src' | 'example' = 'src'

  const closeNewQuote = () => {
    if (inNewQuote) out.push('#+end_quote')
    inNewQuote = false
  }

  for (const line of lines) {
    const fence = /^(\s*)```(.*)$/.exec(line)
    if (inCode) {
      if (fence && !fence[2].trim()) {
        const kept = keptFence ? keep(line) : null
        out.push(kept ?? `${fence[1]}#+end_${codeBlockName}`)
        inCode = false
      } else out.push(keep(line) ?? line)
      continue
    }

    const original = keep(line)
    const hidden = HIDDEN.exec(line)
    if (hidden) {
      closeNewQuote()
      if (/^\s*#\+begin_quote\b/i.test(hidden[1])) inHiddenQuote = true
      if (/^\s*#\+end_quote\b/i.test(hidden[1])) inHiddenQuote = false
      out.push(original ?? hidden[1])
      continue
    }
    if (fence) {
      closeNewQuote()
      const language = fence[2].trim()
      codeBlockName = language === 'example' ? 'example' : 'src'
      keptFence = original !== null
      out.push(original ?? `${fence[1]}#+begin_${codeBlockName}${language && language !== 'example' ? ` ${language}` : ''}`)
      inCode = true
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      if (inHiddenQuote) {
        out.push(original ?? inlineMdToOrg(quote[1]))
        continue
      }
      if (original !== null) {
        out.push(original)
        continue
      }
      if (!inNewQuote) out.push('#+begin_quote')
      inNewQuote = true
      out.push(inlineMdToOrg(quote[1]))
      continue
    }
    closeNewQuote()

    if (original !== null) {
      out.push(original)
      continue
    }
    const heading = /^(#{1,}) (.*)$/.exec(line)
    if (heading) {
      out.push(`${'*'.repeat(heading[1].length)} ${inlineMdToOrg(heading[2])}`)
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('-----')
      continue
    }
    if (isTableRule(line) && line.includes('|')) {
      const trimmed = line.trim().replace(/^\||\|$/g, '').replace(/:/g, '-').replace(/\|/g, '+').replace(/ /g, '-')
      out.push(`${line.match(/^\s*/)![0]}|${trimmed}|`)
      continue
    }
    const listItem = /^(\s*)([-+*]|\d+[.)])(\s+)(.*)$/.exec(line)
    if (listItem) {
      // A `*` at column 0 would be an Org heading.
      const marker = listItem[2] === '*' ? '-' : listItem[2]
      out.push(`${listItem[1]}${marker}${listItem[3]}${inlineMdToOrg(listItem[4])}`)
      continue
    }
    out.push(inlineMdToOrg(line))
  }
  closeNewQuote()
  if (inCode) out.push(`#+end_${codeBlockName}`)
  return out
}

/**
 * Markdown back to Org. `previousBody` is the Org text the Markdown was made from.
 *
 * Each Markdown line that still appears in the previous version takes back its
 * original Org text, the nth occurrence taking the nth original, so an untouched
 * document comes back identical however oddly it was written.
 */
export function markdownToOrg(markdown: string, previousBody: string): string {
  const originals = new Map<string, string[]>()
  const previousOrg = previousBody.split('\n')
  orgLinesToMd(previousBody).forEach((md, i) => {
    const queue = originals.get(md)
    if (queue) queue.push(previousOrg[i])
    else originals.set(md, [previousOrg[i]])
  })
  const keep = (line: string): string | null => originals.get(line)?.shift() ?? null
  return mdLinesToOrg(markdown.split('\n'), keep).join('\n')
}

export function countWords(markdown: string): number {
  let words = 0
  for (const line of markdown.split('\n')) {
    if (isHiddenLine(line)) continue
    const text = line.replace(/^\s*(#+|>|[-+*]|\d+[.)])\s+/, '').trim()
    if (text) words += text.split(/\s+/).length
  }
  return words
}
