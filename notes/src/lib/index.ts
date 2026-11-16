/**
 * A note record → its rows in notes.headings and notes.links.
 *
 * Pure: no database here. The store deletes a record's old rows and inserts
 * these whenever the record is saved, so the index never drifts from the record.
 */
import { DONE_STATES, idLinks, orgId } from './org'
import type { Heading, NoteRecord, Property, Timestamp } from './types'

export type HeadingRow = {
  idx: number
  level: number
  orgId: string | null
  /** The nearest note or heading at or above this one that has an ID: what to open for it. */
  nodeOrgId: string | null
  title: string
  todo: string | null
  done: boolean
  priority: string | null
  tags: string[]
  allTags: string[]
  olp: string[]
  scheduled: string | null
  scheduledTs: Timestamp | null
  deadline: string | null
  deadlineTs: Timestamp | null
  closed: string | null
  properties: Record<string, string>
  /** Plain text for search and snippets; the record keeps the org markup. */
  body: string
}

export type LinkRow = {
  idx: number
  sourceOrgId: string | null
  targetOrgId: string
  description: string | null
  label: string | null
}

const propertyMap = (props?: Property[]) => {
  const out: Record<string, string> = {}
  for (const p of props ?? []) {
    const key = p.key.toUpperCase()
    if (!(key in out)) out[key] = p.value
  }
  return out
}

/**
 * Org text as words to search and show in snippets: links become their
 * description (or their target when they have none), so a snippet never
 * shows [[id:…]] markup.
 */
export function plainText(org: string): string {
  return org
    .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, '$2')
    .replace(/\[\[(?:id:)?([^\]]+)\]\]/g, '$1')
}

const closedAt = (ts?: Timestamp) => (ts ? `${ts.date} ${ts.time ?? '00:00'}:00` : null)

/** A title for a note that has no #+title: its file name, as org-roam would show it. */
export function fallbackTitle(path?: string): string {
  const base = (path ?? '').split('/').pop()?.replace(/\.org$/, '') ?? ''
  return base.replace(/^\d{14}-/, '').replace(/_/g, ' ') || 'Untitled'
}

export function indexRows(note: NoteRecord): { headings: HeadingRow[]; links: LinkRow[] } {
  const noteId = orgId(note.properties)
  const noteTags = note.tags ?? []
  const headings: HeadingRow[] = [{
    idx: 0, level: 0, orgId: noteId, nodeOrgId: noteId, title: note.title, todo: null, done: false, priority: null,
    tags: noteTags, allTags: noteTags, olp: [], scheduled: null, scheduledTs: null, deadline: null,
    deadlineTs: null, closed: null, properties: propertyMap(note.properties), body: plainText(note.body ?? ''),
  }]
  const links: LinkRow[] = []
  for (const l of idLinks(note.body ?? '')) links.push({ idx: 0, sourceOrgId: noteId, targetOrgId: l.target, description: l.description, label: l.label })

  // The open ancestors: index into headings for each level above the current one.
  const stack: { level: number; row: HeadingRow; nearestId: string | null }[] = []
  note.headings.forEach((h: Heading, i) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
    const parent = stack[stack.length - 1]
    const own = orgId(h.properties)
    const nearestId = own ?? parent?.nearestId ?? noteId
    const tags = h.tags ?? []
    const row: HeadingRow = {
      idx: i + 1,
      level: h.level,
      orgId: own,
      nodeOrgId: nearestId,
      title: plainText(h.title),
      todo: h.todo ?? null,
      done: h.todo ? DONE_STATES.has(h.todo) : false,
      priority: h.priority ?? null,
      tags,
      allTags: [...new Set([...(parent?.row.allTags ?? noteTags), ...tags])],
      olp: [note.title, ...stack.map((s) => s.row.title)],
      scheduled: h.scheduled?.date ?? null,
      scheduledTs: h.scheduled ?? null,
      deadline: h.deadline?.date ?? null,
      deadlineTs: h.deadline ?? null,
      closed: closedAt(h.closed),
      properties: propertyMap(h.properties),
      body: plainText(h.body ?? ''),
    }
    headings.push(row)
    for (const l of [...idLinks(h.title), ...idLinks(h.body ?? '')]) {
      links.push({ idx: i + 1, sourceOrgId: nearestId, targetOrgId: l.target, description: l.description, label: l.label })
    }
    stack.push({ level: h.level, row, nearestId })
  })
  return { headings, links }
}
