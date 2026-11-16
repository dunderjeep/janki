/**
 * Org text ⇄ note records.
 *
 * parseOrg() turns one .org file into the parts of a note record: headings with
 * their TODO, priority, tags, planning and property drawer pulled out, and
 * everything else kept as org-markup body text. orgText() writes it back.
 *
 * The rule that keeps this safe: anything the parser does not fully understand
 * (a planning line with a range, a drawer that never closes, a keyword in an odd
 * place) stays in the body exactly as written. What it does take, it writes back
 * in org's canonical layout: LF line endings, tags aligned to column 77, one
 * space after a property key. So orgText(parseOrg(text)) is the same file up to
 * whitespace; test/roundtrip.ts checks that against a real org tree.
 */
import type { Attachment, Heading, Property, Timestamp } from './types'

export type ParsedOrg = {
  title?: string
  tags?: string[]
  properties?: Property[]
  body?: string
  headings: Heading[]
}

/** Keywords org treats as TODO states unless a file says otherwise with #+TODO. */
export const DEFAULT_TODO = ['TODO', 'NEXT', 'WAIT', 'HOLD', 'SOMEDAY', 'DONE', 'CANCELLED']
/** The states that count as finished. */
export const DONE_STATES = new Set(['DONE', 'CANCELLED', 'CANCELED'])

const HEADING = /^(\*+)(?:[ \t]+(.*))?$/
const TAGS = /^(.*?)([ \t]+)(:(?:[\p{L}\p{N}_@#%]+:)+)[ \t]*$/u
const PRIORITY = /^\[#([A-Z0-9])\](?: |$)/
const PROPERTY = /^[ \t]*:([^\s:]+):(?:[ \t]+(.*?))?[ \t]*$/
const DRAWER_START = /^[ \t]*:PROPERTIES:[ \t]*$/
const DRAWER_END = /^[ \t]*:END:[ \t]*$/
const PLANNING_LINE = /^[ \t]*(SCHEDULED|DEADLINE|CLOSED):/

// <2026-11-15 Sun 09:00-10:00 ++1w -2d>
const TIMESTAMP = new RegExp(
  '^([<\\[])(\\d{4}-\\d{2}-\\d{2})' +
  '(?: ([^\\s\\d>\\]+-]+))?' +
  '(?: (\\d{1,2}:\\d{2})(?:-(\\d{1,2}:\\d{2}))?)?' +
  '(?: ((?:\\.\\+|\\+\\+|\\+)\\d+[hdwmy](?:/\\d+[hdwmy])?))?' +
  '(?: (--?\\d+[hdwmy]))?' +
  '([>\\]])$',
)

export function parseTimestamp(text: string): Timestamp | null {
  const m = TIMESTAMP.exec(text)
  if (!m) return null
  const [, open, date, day, time, endTime, repeat, warning, close] = m
  if ((open === '<') !== (close === '>')) return null
  const ts: Timestamp = { active: open === '<', date }
  if (day) ts.day = day
  if (time) ts.time = time
  if (endTime) ts.endTime = endTime
  if (repeat) ts.repeat = repeat
  if (warning) ts.warning = warning
  return ts
}

export function timestampText(ts: Timestamp): string {
  const parts = [ts.date, ts.day, ts.time && (ts.endTime ? `${ts.time}-${ts.endTime}` : ts.time), ts.repeat, ts.warning]
  const inner = parts.filter(Boolean).join(' ')
  return ts.active ? `<${inner}>` : `[${inner}]`
}

/** "SCHEDULED: <…> DEADLINE: <…>" → fields, or null if any part isn't plain. */
function parsePlanning(line: string): Pick<Heading, 'scheduled' | 'deadline' | 'closed'> | null {
  if (!PLANNING_LINE.test(line)) return null
  const out: Pick<Heading, 'scheduled' | 'deadline' | 'closed'> = {}
  const re = /(SCHEDULED|DEADLINE|CLOSED):[ \t]*([<[][^>\]]*[>\]])/y
  line = line.trim()
  let at = 0
  while (at < line.length) {
    re.lastIndex = at
    const m = re.exec(line)
    if (!m) return null
    const ts = parseTimestamp(m[2])
    const key = m[1].toLowerCase() as 'scheduled' | 'deadline' | 'closed'
    if (!ts || out[key]) return null
    out[key] = ts
    at = re.lastIndex
    if (at < line.length) {
      const gap = /^[ \t]+/.exec(line.slice(at))
      if (!gap) return null
      at += gap[0].length
    }
  }
  return out
}

function planningText(h: Pick<Heading, 'scheduled' | 'deadline' | 'closed'>): string {
  const parts: string[] = []
  // org writes CLOSED first when it closes an item with planning already present.
  if (h.closed) parts.push(`CLOSED: ${timestampText(h.closed)}`)
  if (h.deadline) parts.push(`DEADLINE: ${timestampText(h.deadline)}`)
  if (h.scheduled) parts.push(`SCHEDULED: ${timestampText(h.scheduled)}`)
  return parts.join(' ')
}

/** A property drawer starting at lines[i], or null. Returns the index after :END:. */
function parseDrawer(lines: string[], i: number): { props: Property[]; next: number } | null {
  if (i >= lines.length || !DRAWER_START.test(lines[i])) return null
  const props: Property[] = []
  for (let j = i + 1; j < lines.length; j++) {
    if (DRAWER_END.test(lines[j])) return { props, next: j + 1 }
    const m = PROPERTY.exec(lines[j])
    if (!m || m[1] === 'END' || m[1] === 'PROPERTIES') return null
    props.push({ key: m[1], value: m[2] ?? '' })
  }
  return null
}

const propertyLine = (p: Property) => (p.value ? `:${p.key}: ${p.value}` : `:${p.key}:`)

function drawerLines(props: Property[], attachments: Attachment[] = []): string[] {
  return [':PROPERTIES:', ...props.map(propertyLine), ...attachments.map(attachmentLine), ':END:']
}

/**
 * An attachment as a drawer line: `:ATTACHMENT: <cid> <size> <type> <added> <name>`.
 * The name goes last because it may hold spaces.
 */
const attachmentLine = (a: Attachment) =>
  `:ATTACHMENT: ${a.blob.ref.$link} ${a.blob.size} ${a.blob.mimeType} ${a.addedAt} ${a.name}`

function parseAttachment(value: string): Attachment | null {
  const m = /^(b[a-z2-7]{20,}) (\d+) (\S+\/\S+) (\S+) (.+)$/.exec(value)
  if (!m) return null
  return { name: m[5], blob: { $type: 'blob', ref: { $link: m[1] }, mimeType: m[3], size: Number(m[2]) }, addedAt: m[4] }
}

/** Takes the ATTACHMENT lines out of a drawer into typed attachments. */
function splitAttachments(props: Property[]): { props: Property[]; attachments: Attachment[] } {
  const attachments: Attachment[] = []
  const rest: Property[] = []
  for (const p of props) {
    const a = p.key.toUpperCase() === 'ATTACHMENT' ? parseAttachment(p.value) : null
    if (a) attachments.push(a)
    else rest.push(p)
  }
  return { props: rest, attachments }
}

/** Splits "TODO [#A] Title  :a:b:" into its parts, or keeps it all as the title. */
function parseHeadline(text: string, todoWords: Set<string>): Omit<Heading, 'level'> {
  let rest = text
  const h: Omit<Heading, 'level'> = { title: '' }
  const word = /^(\S+)(?: |$)/.exec(rest)
  if (word && todoWords.has(word[1])) {
    h.todo = word[1]
    rest = rest.slice(word[0].length)
  }
  const pri = PRIORITY.exec(rest)
  if (pri) {
    h.priority = pri[1]
    rest = rest.slice(pri[0].length)
  }
  const tags = TAGS.exec(rest)
  if (tags) {
    h.tags = tags[3].slice(1, -1).split(':')
    rest = tags[1]
  }
  h.title = rest.trimEnd()
  return h
}

/** Where org puts tags: right-aligned to column 77, or one space after the title if it is longer. */
const TAG_COLUMN = 77

function headlineText(h: Heading): string {
  let head = '*'.repeat(h.level)
  const words = [h.todo, h.priority && `[#${h.priority}]`, h.title].filter((w) => w !== undefined && w !== '')
  if (words.length || h.title === '') head += ' ' + words.join(' ')
  if (h.tags?.length) {
    const tags = `:${h.tags.join(':')}:`
    const base = head.trimEnd()
    const pad = Math.max(1, TAG_COLUMN - base.length - tags.length)
    return base + ' '.repeat(pad) + tags
  }
  return head
}

function readTodoWords(lines: string[]): Set<string> {
  const words = new Set<string>()
  for (const line of lines) {
    const m = /^#\+(?:SEQ_|TYP_)?TODO:\s*(.*)$/i.exec(line)
    if (!m) continue
    for (const w of m[1].split(/\s+/)) {
      if (w && w !== '|') words.add(w.replace(/\(.*\)$/, ''))
    }
  }
  return words.size ? words : new Set(DEFAULT_TODO)
}

/** One section: a heading (or the file's preamble) and the lines it owns. */
type Section = { headline: string | null; lines: string[] }

function sections(lines: string[]): Section[] {
  const out: Section[] = [{ headline: null, lines: [] }]
  for (const line of lines) {
    if (HEADING.test(line)) out.push({ headline: line, lines: [] })
    else out[out.length - 1].lines.push(line)
  }
  return out
}

const bodyOf = (lines: string[]) => (lines.length ? lines.join('\n') : undefined)

/**
 * Pulls #+title and #+filetags out of the leading run of #+ keyword lines.
 * Both are written back first, so they are only taken from the front, the place
 * org-roam puts them; anywhere else they stay in the body.
 */
function parsePreambleKeywords(lines: string[]): { title?: string; tags?: string[]; rest: string[] } {
  let i = 0
  let title: string | undefined
  let tags: string[] | undefined
  for (; i < lines.length; i++) {
    const m = /^#\+(title|filetags):[ \t]*(.*?)[ \t]*$/i.exec(lines[i])
    if (!m) break
    const key = m[1].toLowerCase()
    if (key === 'title') {
      if (title !== undefined) break
      title = m[2]
    } else {
      if (tags !== undefined) break
      tags = m[2].split(/[:\s]+/).filter(Boolean)
    }
  }
  return { title, tags, rest: lines.slice(i) }
}

export type ParseResult = ParsedOrg

/**
 * `fragment`: the text is a piece of a note, such as the part under one heading
 * that a note card edits, so its opening lines are body text, never a file's
 * property drawer or #+title.
 */
export function parseOrg(text: string, { fragment = false, todo }: { fragment?: boolean; todo?: Set<string> } = {}): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const todoWords = todo ?? readTodoWords(lines)
  const [pre, ...rest] = sections(lines)
  const result: ParseResult = { headings: [] }

  let preLines = pre.lines
  if (!fragment) {
    const drawer = parseDrawer(preLines, 0)
    if (drawer) {
      result.properties = drawer.props
      preLines = preLines.slice(drawer.next)
    }
    const kw = parsePreambleKeywords(preLines)
    if (kw.title !== undefined) result.title = kw.title
    if (kw.tags) result.tags = kw.tags
    preLines = kw.rest
  }
  result.body = bodyOf(preLines)

  for (const s of rest) {
    const m = HEADING.exec(s.headline!)!
    const heading: Heading = { level: m[1].length, ...parseHeadline(m[2] ?? '', todoWords) }
    if (m[2] === undefined) heading.title = ''

    let i = 0
    const planning = s.lines.length ? parsePlanning(s.lines[0]) : null
    if (planning) {
      Object.assign(heading, planning)
      i = 1
    }
    const d = parseDrawer(s.lines, i)
    if (d) {
      const { props, attachments } = splitAttachments(d.props)
      // An empty drawer is still a drawer: keep it, so it writes back.
      heading.properties = props
      if (attachments.length) heading.attachments = attachments
      i = d.next
    }
    const body = bodyOf(s.lines.slice(i))
    if (body !== undefined) heading.body = body
    result.headings.push(heading)
  }
  return result
}

export function orgText(note: ParsedOrg): string {
  const out: string[] = []
  if (note.properties) out.push(...drawerLines(note.properties))
  if (note.title !== undefined) out.push(`#+title: ${note.title}`)
  if (note.tags?.length) out.push(`#+filetags: :${note.tags.join(':')}:`)
  if (note.body !== undefined) out.push(note.body)
  out.push(...headingsLines(note.headings))
  return out.join('\n')
}

/** Headings written out in full: headline, planning, drawer and body. */
export function headingsLines(headings: Heading[]): string[] {
  const out: string[] = []
  for (const h of headings) {
    out.push(headlineText(h))
    const planning = planningText(h)
    if (planning) out.push(planning)
    if (h.properties || h.attachments?.length) out.push(...drawerLines(h.properties ?? [], h.attachments))
    if (h.body !== undefined) out.push(h.body)
  }
  return out
}

/** The TODO words a note uses: its own #+TODO lines, or org's defaults. */
export function todoWordsOf(body: string | undefined): Set<string> {
  return readTodoWords((body ?? '').split('\n'))
}

/** The org ID of a heading or note, from its property drawer. */
export const orgId = (props?: Property[]) => props?.find((p) => p.key.toUpperCase() === 'ID')?.value || null

/** A plain list item: its bullet (and checkbox), then an optional `term ::`. */
export const LIST_ITEM = /^([ \t]*[-+*][ \t]+(?:\[[ Xx-]\][ \t]+)?)(?:(.*?)[ \t]+::[ \t]+)?/
const LINK = /\[\[id:([^\]\s]+)\](?:\[([^\]]*)\])?\]/g

export type IdLink = {
  target: string
  description: string | null
  /** The description-list term on the link's line, `- supports :: [[id:…]]`: what the link means. */
  label: string | null
}

/** [[id:…][description]] and [[id:…]] in a piece of org text. */
export function idLinks(text: string): IdLink[] {
  const out: IdLink[] = []
  for (const line of text.split('\n')) {
    if (!line.includes('[[id:')) continue
    const item = LIST_ITEM.exec(line)
    const label = item?.[2]?.trim() || null
    for (const m of line.matchAll(LINK)) out.push({ target: m[1], description: m[2] ?? null, label })
  }
  return out
}
