/** Shapes shared by the Scatterbrain routes and its client components. */
import type { ItemKind, ItemStatus } from '@/db/schema/scatterbrain'

export type { ItemKind, ItemStatus }

export type WorkSummary = {
  id: string
  title: string
  kind: string
  logline: string
  coverPinId: string | null
  wordCount: number
  targetWords: number | null
  lastOpenedAt: string
  /** The document you were last in, if any. */
  lastItemTitle: string | null
}

export type WorkView = WorkSummary & {
  notes: string
  sessionTarget: number | null
  /** Words written in this work today. */
  sessionWords: number
  boardId: string | null
  /** Where you were last time, so a reload — on any device — lands there. */
  lastItemId: string | null
  lastView: string | null
}

export type ItemView = {
  id: string
  parentId: string | null
  kind: ItemKind
  title: string
  synopsis: string
  notes: string
  status: ItemStatus
  orgPath: string | null
  povCharacterId: string | null
  wordCount: number
  targetWords: number | null
  position: number
  characterIds: string[]
}

export type CharacterView = {
  id: string
  name: string
  role: string
  description: string
  position: number
}

export type AttachmentView = {
  id: string
  itemId: string | null
  characterId: string | null
  pinId: string
  caption: string
  position: number
  title: string | null
  filename: string
  description: string | null
  sourceUrl: string | null
}

export type WorkBundle = {
  work: WorkView
  items: ItemView[]
  characters: CharacterView[]
  attachments: AttachmentView[]
  works: WorkSummary[]
}

export type BodyView = {
  markdown: string
  /** Fingerprint of the file as loaded. Null for text stored in Scatterbrain. */
  sha: string | null
  orgPath: string | null
  /** The file's own #+title, when it has one. */
  fileTitle: string | null
  missing: boolean
}

export type SnapshotView = { id: string; kind: 'auto' | 'manual'; label: string; preview: string; createdAt: string }

export type OrgHit = { path: string; title: string; snippet: string; modified: string }

/** What someone typed into a target box, tolerating "80,000". Blank or nonsense means no target. */
export function parseWordTarget(value: string): number | null {
  const number = parseInt(value.replace(/[\s,._]/g, ''), 10)
  return number > 0 ? number : null
}

export const CONTAINER_KINDS: ItemKind[] = ['part', 'act', 'chapter']
export const isContainer = (kind: ItemKind) => CONTAINER_KINDS.includes(kind)

export const KIND_LABEL: Record<ItemKind, string> = { part: 'Part', act: 'Act', chapter: 'Chapter', scene: 'Scene', note: 'Note' }

export const STATUS_LABEL: Record<ItemStatus, string> = { idea: 'Idea', draft: 'Draft', revised: 'Revised', done: 'Done' }

export const WORK_KINDS = [
  { value: 'novel', label: 'Novel', hint: 'Starts with an act, a chapter and a scene' },
  { value: 'story', label: 'Short story', hint: 'Starts with a single scene' },
  { value: 'essay', label: 'Essay or article', hint: 'Starts with a single section' },
  { value: 'scraps', label: 'Scraps', hint: 'Empty: a place for loose ideas' },
  { value: 'docs', label: 'Project docs', hint: "A project's documents, from Next" },
] as const
