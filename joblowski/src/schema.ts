/**
 * Joblowski — job search and applications. Postgres schema "joblowski"; see migration
 * 0018 for what each table is for.
 *
 * listings.search (a tsvector) and listings.ad_key are generated columns and
 * are left out here on purpose: Drizzle never writes them, and queries reach
 * them through raw SQL.
 */
import { pgSchema, text, integer, boolean, timestamp, date, jsonb, primaryKey, doublePrecision } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const joblowski = pgSchema('joblowski')

const id = () => text('id').primaryKey().$defaultFn(() => nanoid())
const at = (name: string) => timestamp(name, { withTimezone: true })

export const joblowskiDocuments = joblowski.table('documents', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull().default(''),
  style: text('style').notNull().default('classic'),
  derivedFrom: text('derived_from'),
  aiNotes: jsonb('ai_notes'),
  archivedAt: at('archived_at'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

export const joblowskiRevisions = joblowski.table('revisions', {
  id: id(),
  documentId: text('document_id').notNull(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  style: text('style').notNull(),
  sha256: text('sha256').notNull(),
  label: text('label'),
  createdAt: at('created_at').notNull().defaultNow(),
})

export const joblowskiApplications = joblowski.table('applications', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  company: text('company').notNull(),
  role: text('role').notNull(),
  url: text('url'),
  location: text('location'),
  /** A broad kind of job, e.g. "Software / IT" or "Kitchen". */
  category: text('category'),
  /** Street address, and where it is, for the map. */
  address: text('address'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  status: text('status').notNull().default('saved'),
  /** A parked job comes back to its earlier status on this day; null parks it until you say. */
  parkedUntil: date('parked_until'),
  dateApplied: date('date_applied'),
  dueDate: date('due_date'),
  notes: text('notes').notNull().default(''),
  posting: text('posting').notNull().default(''),
  source: text('source'),
  resumeRevisionId: text('resume_revision_id'),
  letterRevisionId: text('letter_revision_id'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

/** A job's history: each status it has been in, and notes with no status, such as "took the test". */
export const joblowskiStatusEvents = joblowski.table('status_events', {
  id: id(),
  applicationId: text('application_id').notNull(),
  ownerUid: text('owner_uid').notNull(),
  status: text('status'),
  note: text('note'),
  at: at('at').notNull().defaultNow(),
})

export const joblowskiListings = joblowski.table('listings', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  company: text('company').notNull().default(''),
  location: text('location').notNull().default(''),
  remote: boolean('remote').notNull().default(false),
  url: text('url').notNull(),
  description: text('description').notNull().default(''),
  tags: text('tags').notNull().default(''),
  salary: text('salary'),
  publishedAt: at('published_at'),
  expiresOn: date('expires_on'),
  /** en, no, de or other, from the ad's own little words; null when too short to say. */
  language: text('language'),
  /** Pay as the ad states it: amount, currency and period (year, month, day, hour). */
  payMin: doublePrecision('pay_min'),
  payMax: doublePrecision('pay_max'),
  payCurrency: text('pay_currency'),
  payPeriod: text('pay_period'),
  firstSeenAt: at('first_seen_at').notNull().defaultNow(),
  lastSeenAt: at('last_seen_at').notNull().defaultNow(),
})

export const joblowskiSourceState = joblowski.table('source_state', {
  source: text('source').primaryKey(),
  lastAttemptAt: at('last_attempt_at'),
  fetchedAt: at('fetched_at'),
  lastCount: integer('last_count'),
  lastError: text('last_error'),
})

export const joblowskiSavedSearches = joblowski.table('saved_searches', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  location: text('location').notNull().default(''),
  sources: text('sources').array().notNull(),
  /** Posted within N days, language, starting soon, with pay; see SearchFilters. */
  filters: jsonb('filters').notNull().default({}),
  /** The ladder: narrow searches first, broad ones last. */
  rank: integer('rank').notNull().default(0),
  alert: boolean('alert').notNull().default(true),
  lastRunAt: at('last_run_at'),
  createdAt: at('created_at').notNull().defaultNow(),
})

/** NOK per one unit of each currency, edited by hand. */
export const joblowskiRates = joblowski.table('rates', {
  currency: text('currency').primaryKey(),
  nok: doublePrecision('nok').notNull(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

export const joblowskiHits = joblowski.table(
  'hits',
  {
    searchId: text('search_id').notNull(),
    listingId: text('listing_id').notNull(),
    ownerUid: text('owner_uid').notNull(),
    firstSeenAt: at('first_seen_at').notNull().defaultNow(),
    seenAt: at('seen_at'),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.listingId] })],
)

/**
 * Ads the person has dismissed from alerts. Keyed by listings.ad_key, the
 * title and company reduced to letters and digits, which is also what dedupes
 * one ad across sources, so it stays dismissed whichever board lists it next.
 */
export const joblowskiDismissed = joblowski.table(
  'dismissed',
  {
    ownerUid: text('owner_uid').notNull(),
    adKey: text('ad_key').notNull(),
    title: text('title').notNull(),
    company: text('company').notNull(),
    dismissedAt: at('dismissed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerUid, t.adKey] })],
)

export const joblowskiBoards = joblowski.table('boards', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  urlTemplate: text('url_template').notNull(),
  section: text('section').notNull().default('Your links'),
  note: text('note').notNull().default(''),
  /** Also offered under the search box on the Search tab. */
  quick: boolean('quick').notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: at('created_at').notNull().defaultNow(),
})

/** Who has had the standard boards copied in, so removed ones stay removed. */
export const joblowskiBoardsSeeded = joblowski.table('boards_seeded', {
  ownerUid: text('owner_uid').primaryKey(),
  seededAt: at('seeded_at').notNull().defaultNow(),
})

export const joblowskiDocMessages = joblowski.table('doc_messages', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  documentId: text('document_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  proposal: jsonb('proposal'),
  appliedAt: at('applied_at'),
  createdAt: at('created_at').notNull().defaultNow(),
})

/** Things you have said about yourself, kept as source material for every draft. */
export const joblowskiFacts = joblowski.table('facts', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  text: text('text').notNull(),
  sourceDocumentId: text('source_document_id'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

/** A planned walk between tracked jobs, in walking order. */
export const joblowskiWalks = joblowski.table('walks', {
  id: id(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  stopIds: text('stop_ids').array().notNull().default([]),
  route: jsonb('route'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
})

/** Where walks start and end. */
export const joblowskiMapHome = joblowski.table('map_home', {
  ownerUid: text('owner_uid').primaryKey(),
  address: text('address').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
})
