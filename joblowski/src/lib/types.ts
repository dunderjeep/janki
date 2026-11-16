/** Shapes and constants shared by the server and the browser. */

export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'withdrawn', 'parked'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  parked: 'Parked',
}

/** Still in play, so a due date on it matters. */
export const OPEN_STATUSES: Status[] = ['saved', 'applied', 'interview', 'offer']

/** Nothing sent yet. A parked job is kept for later: not open, so no due-date nag and no next action in Dough. */
export const UNSENT_STATUSES: Status[] = ['saved', 'parked']

export type DocKind = 'resume' | 'letter'
export const DOC_STYLES = ['classic', 'modern'] as const
export type DocStyle = (typeof DOC_STYLES)[number]

export const SOURCES = [
  { key: 'nav', label: 'Arbeidsplassen', home: 'https://arbeidsplassen.nav.no/stillinger', region: 'Norway' },
  { key: 'arbeitnow', label: 'Arbeitnow', home: 'https://www.arbeitnow.com', region: 'Europe' },
  { key: 'remotive', label: 'Remotive', home: 'https://remotive.com', region: 'Remote' },
  { key: 'remoteok', label: 'Remote OK', home: 'https://remoteok.com', region: 'Remote' },
  { key: 'jobicy', label: 'Jobicy', home: 'https://jobicy.com', region: 'Remote' },
] as const
export type SourceKey = (typeof SOURCES)[number]['key']
export const SOURCE_KEYS = SOURCES.map((s) => s.key) as SourceKey[]
export const sourceLabel = (key: string | null) => SOURCES.find((s) => s.key === key)?.label ?? key ?? ''

export type PinnedDoc = {
  revisionId: string
  documentId: string
  name: string
  pinnedAt: string
  /** The document has been edited since this copy was taken. */
  changedSince: boolean
}

export type Application = {
  id: string
  company: string
  role: string
  url: string | null
  location: string | null
  category: string | null
  /** Street address and where it is, for the map. */
  address: string | null
  lat: number | null
  lon: number | null
  status: Status
  /** When a parked job comes back on its own; null parks it until you say. */
  parkedUntil: string | null
  dateApplied: string | null
  dueDate: string | null
  notes: string
  posting: string
  source: string | null
  resume: PinnedDoc | null
  letter: PinnedDoc | null
  /** Status changes, and notes (no status) such as "took the test". */
  history: { id: string; status: Status | null; note: string | null; at: string }[]
  createdAt: string
}

export type DocSummary = {
  id: string
  kind: DocKind
  name: string
  style: DocStyle
  updatedAt: string
  versions: number
  usedIn: number
}

export type Revision = { id: string; label: string | null; createdAt: string }

/** What came with a draft from Claude, for the person to review before sending. */
export type DraftNotes = {
  changes: string[]
  keywordsUsed: string[]
  gaps: string[]
  suspiciousInstructions: string[]
  newNumbers: string[]
  termsFromAd: string[]
}

export type Doc = DocSummary & { body: string; revisions: Revision[]; aiNotes: DraftNotes | null; derivedFrom: string | null }

/** Narrowing a search beyond its words: how recent, which language, starting at once, stating pay. */
export type SearchFilters = { days: number | null; language: '' | 'en' | 'no'; soon: boolean; paid: boolean }
export const NO_FILTERS: SearchFilters = { days: null, language: '', soon: false, paid: false }
export const LANGUAGE_LABEL: Record<string, string> = { en: 'English', no: 'Norwegian', de: 'German', other: 'Other language' }

/** "English · 7 days · starting soon · with pay", for a saved search's name. */
export function describeFilters(f: SearchFilters): string {
  return [
    f.language && LANGUAGE_LABEL[f.language],
    f.days && (f.days === 1 ? 'today' : `${f.days} days`),
    f.soon && 'starting soon',
    f.paid && 'with pay',
  ].filter(Boolean).join(' · ')
}

/** Pay as an ad states it. */
export type Pay = { min: number; max: number | null; currency: string; period: 'year' | 'month' | 'day' | 'hour' }
/** NOK per one unit of a currency. */
export type Rates = Record<string, number>

/** One rung of a suggested ladder of searches. */
export type SearchSuggestion = { tier: number; name: string; query: string; location: string; sources: SourceKey[]; filters: SearchFilters; why: string }

export type Listing = {
  id: string
  source: string
  title: string
  company: string
  location: string
  remote: boolean
  url: string
  snippet: string
  salary: string | null
  language: string | null
  pay: Pay | null
  publishedAt: string | null
  expiresOn: string | null
  trackedId: string | null
  trackedStatus: Status | null
  /** Dismissed from alerts. A search still shows it, dimmed, so it can be restored. */
  dismissed: boolean
}

/** searchIds: every alert that found it, so the list can be narrowed to one alert. */
export type NewHit = Listing & { searchName: string; searchIds: string[] }

export type SourceStatus = { source: string; count: number | null; fetchedAt: string | null; error: string | null }

export type SavedSearch = {
  id: string
  name: string
  query: string
  location: string
  sources: SourceKey[]
  filters: SearchFilters
  alert: boolean
  lastRunAt: string | null
  unseen: number
}

export type CustomBoard = { id: string; name: string; urlTemplate: string; section: string; note: string; quick: boolean; position: number }

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const PLACEHOLDER = /\{\{\s*(company|role|date)\s*\}\}/gi
