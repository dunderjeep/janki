/**
 * Searching and alerts. Listings are copied into Postgres and searched there,
 * so one query syntax covers every source: words must all appear, "quoted
 * phrases" stay together, OR gives alternatives and -word excludes.
 */
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../host'
import { joblowskiHits, joblowskiListings, joblowskiSavedSearches, joblowskiSourceState } from '../schema'
import { detectLanguage } from './language'
import { parsePay, payColumns } from './pay'
import { FEEDS, NavBusy, searchNav, usable, type NormalListing } from './sources'
import { JoblowskiError } from './store'
import type { Listing, NewHit, Pay, SavedSearch, SearchFilters, SourceKey, SourceStatus, Status } from './types'
import { SOURCE_KEYS } from './types'

const FEED_MAX_AGE_HOURS = 6 // Remotive asks for at most four pulls a day.
const FEED_RETRY_HOURS = 1
const ALERT_INTERVAL_HOURS = 6
const LISTING_FRESH_DAYS = 14
const LISTING_KEEP_DAYS = 90
const RESULT_LIMIT = 200

/** A remote ad open to someone in Europe. Anything naming only elsewhere fails. */
const REMOTE_FROM_HERE = 'worldwide|anywhere|global|remote|europe|emea|\\yeu\\y|norway|norge|nordic|scandinavia'

/** Ads that say they start at once, in the languages the boards carry. */
const SOON_WORDS = 'snarest OR asap OR omgående OR "immediate start" OR "start immediately" OR "as soon as possible" OR "så snart som mulig" OR "starting soon" OR "immediately available" OR umgehend OR "ab sofort"'

async function upsertListings(listings: NormalListing[]): Promise<void> {
  // What the ad is written in, and what it pays, are read once here for every source.
  const unique = [...new Map(listings.filter(usable).map((l) => [l.id, l])).values()].map((l) => ({
    ...l,
    language: detectLanguage(`${l.title} ${l.description}`),
    ...payColumns(parsePay(l.salary, l.description)),
  }))
  for (let i = 0; i < unique.length; i += 200) {
    await db
      .insert(joblowskiListings)
      .values(unique.slice(i, i + 200))
      .onConflictDoUpdate({
        target: joblowskiListings.id,
        set: {
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          location: sql`excluded.location`,
          remote: sql`excluded.remote`,
          url: sql`excluded.url`,
          description: sql`excluded.description`,
          tags: sql`excluded.tags`,
          salary: sql`excluded.salary`,
          language: sql`excluded.language`,
          payMin: sql`excluded.pay_min`,
          payMax: sql`excluded.pay_max`,
          payCurrency: sql`excluded.pay_currency`,
          payPeriod: sql`excluded.pay_period`,
          publishedAt: sql`excluded.published_at`,
          expiresOn: sql`excluded.expires_on`,
          lastSeenAt: sql`now()`,
        },
      })
  }
}

async function pullFeed(source: keyof typeof FEEDS): Promise<void> {
  // Recorded first, so a crash or a failing source still counts against the limit.
  await db
    .insert(joblowskiSourceState)
    .values({ source, lastAttemptAt: new Date() })
    .onConflictDoUpdate({ target: joblowskiSourceState.source, set: { lastAttemptAt: new Date() } })
  try {
    const listings = await FEEDS[source]()
    await upsertListings(listings)
    await db
      .update(joblowskiSourceState)
      .set({ fetchedAt: new Date(), lastCount: listings.length, lastError: null })
      .where(eq(joblowskiSourceState.source, source))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[joblowski] ${source}: ${message}`)
    await db.update(joblowskiSourceState).set({ lastError: message.slice(0, 300) }).where(eq(joblowskiSourceState.source, source))
  }
}

let refreshing: Promise<void> | null = null

/** Pulls every feed that is due. Concurrent callers share a single pull. */
function refreshFeeds(): Promise<void> {
  refreshing ??= (async () => {
    const state = await db.select().from(joblowskiSourceState)
    const due = (Object.keys(FEEDS) as (keyof typeof FEEDS)[]).filter((source) => {
      const row = state.find((s) => s.source === source)
      if (!row?.lastAttemptAt) return true
      const hours = (Date.now() - row.lastAttemptAt.getTime()) / 3_600_000
      return hours >= (row.lastError ? FEED_RETRY_HOURS : FEED_MAX_AGE_HOURS)
    })
    await Promise.all(due.map(pullFeed))
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

type Query = { query: string; location: string; sources: SourceKey[]; filters: SearchFilters }

/** Filters as sent by the browser or kept on a saved search, with anything odd dropped. */
export function readFilters(raw: unknown): SearchFilters {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const days = Number(f.days)
  return {
    days: Number.isInteger(days) && days > 0 ? Math.min(90, days) : null,
    language: f.language === 'en' || f.language === 'no' ? f.language : '',
    soon: f.soon === true,
    paid: f.paid === true,
  }
}

export function readQuery(body: Record<string, unknown>): Query {
  const query = String(body.query ?? '').trim()
  const location = String(body.location ?? '').trim()
  if (query.length > 200 || location.length > 80) throw new JoblowskiError('That search is too long')
  const asked = Array.isArray(body.sources) ? body.sources.map(String) : []
  const sources = SOURCE_KEYS.filter((k): k is SourceKey => asked.includes(k))
  if (sources.length === 0) throw new JoblowskiError('Pick at least one source')
  return { query, location, sources, filters: readFilters(body.filters) }
}

type Row = {
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
  pay_min: number | null
  pay_max: number | null
  pay_currency: string | null
  pay_period: string | null
  published_at: Date | string | null
  expires_on: string | Date | null
  ad_key: string
  tracked_id: string | null
  tracked_status: string | null
  dismissed: boolean
  search_name?: string
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString())
const dateOnly = (d: Date | string | null) => (d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

const toListing = (r: Row): Listing => ({
  id: r.id,
  source: r.source,
  title: r.title,
  company: r.company,
  location: r.location,
  remote: r.remote,
  url: r.url,
  snippet: r.snippet,
  salary: r.salary,
  language: r.language,
  pay: r.pay_min === null || !r.pay_currency || !r.pay_period ? null : { min: r.pay_min, max: r.pay_max, currency: r.pay_currency, period: r.pay_period as Pay['period'] },
  publishedAt: iso(r.published_at),
  expiresOn: dateOnly(r.expires_on),
  trackedId: r.tracked_id,
  trackedStatus: r.tracked_status as Status | null,
  dismissed: r.dismissed,
})

const LISTING_COLUMNS = (uid: string) => sql`
  l.id, l.source, l.title, l.company, l.location, l.remote, l.url, left(l.description, 280) AS snippet,
  l.salary, l.language, l.pay_min, l.pay_max, l.pay_currency, l.pay_period, l.published_at, l.expires_on, l.ad_key,
  (SELECT a.id FROM joblowski.applications a WHERE a.owner_uid = ${uid} AND a.url = l.url) AS tracked_id,
  (SELECT a.status FROM joblowski.applications a WHERE a.owner_uid = ${uid} AND a.url = l.url) AS tracked_status,
  EXISTS (SELECT 1 FROM joblowski.dismissed d WHERE d.owner_uid = ${uid} AND d.ad_key = l.ad_key) AS dismissed`

/** For queries over hits h and listings l: an ad the person has dismissed is never news. */
const NOT_DISMISSED = sql`NOT EXISTS (SELECT 1 FROM joblowski.dismissed d WHERE d.owner_uid = h.owner_uid AND d.ad_key = l.ad_key)`

/** The same ad often reaches several sources. ad_key is its title and company, letters and digits only. */
function dedupe<T extends { ad_key: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    if (seen.has(r.ad_key)) return false
    seen.add(r.ad_key)
    return true
  })
}

async function matching(uid: string, { query, location, sources, filters }: Query): Promise<Listing[]> {
  if (sources.length === 0) return []
  const conditions: SQL[] = [
    sql`l.source IN (${sql.join(sources.map((s) => sql`${s}`), sql`, `)})`,
    sql`l.last_seen_at > now() - make_interval(days => ${LISTING_FRESH_DAYS})`,
    sql`(l.expires_on IS NULL OR l.expires_on >= CURRENT_DATE)`,
  ]
  if (filters.days) conditions.push(sql`l.published_at >= now() - make_interval(days => ${filters.days})`)
  if (filters.language) conditions.push(sql`l.language = ${filters.language}`)
  if (filters.soon) conditions.push(sql`l.search @@ websearch_to_tsquery('simple', ${SOON_WORDS})`)
  if (filters.paid) conditions.push(sql`l.pay_min IS NOT NULL`)
  if (query.trim()) conditions.push(sql`l.search @@ websearch_to_tsquery('simple', ${query})`)
  if (location.trim()) {
    conditions.push(sql`(l.location ILIKE ${`%${location.trim().replace(/[%_\\]/g, '\\$&')}%`}
      OR (l.remote AND (l.location = '' OR l.location ~* ${REMOTE_FROM_HERE})))`)
  }
  // A word in the job title says far more than the same word somewhere in the ad.
  const titleFirst = query.trim() ? sql`(to_tsvector('simple', l.title) @@ websearch_to_tsquery('simple', ${query})) DESC,` : sql``
  const { rows } = await db.execute<Row>(sql`
    SELECT ${LISTING_COLUMNS(uid)}
    FROM joblowski.listings l
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${titleFirst} l.published_at DESC NULLS LAST
    LIMIT ${RESULT_LIMIT}`)
  return dedupe(rows).map(toListing)
}

const NAV_ALTERNATIVES = 3
const NAV_REMEMBER_MS = 6 * 60 * 60_000
/** When each NAV question was last asked; its answers are in the listings table already. */
const navAsked = new Map<string, number>()

/**
 * NAV wants every word, so "kokk OR souschef" would find nothing as one
 * request. The first few OR alternatives are asked for one by one, and not
 * again for six hours, since the ladder's rungs share many of them and NAV
 * blocks a machine that asks too often.
 */
async function gatherNav(query: string, location: string): Promise<void> {
  const alternatives = query.split(/\s+OR\s+/i).map((a) => a.trim()).filter(Boolean)
  for (const alt of (alternatives.length ? alternatives : ['']).slice(0, NAV_ALTERNATIVES)) {
    const key = `${alt.toLowerCase()}|${location.toLowerCase()}`
    const asked = navAsked.get(key)
    if (asked && Date.now() - asked < NAV_REMEMBER_MS) continue
    await upsertListings(await searchNav(alt, location))
    navAsked.set(key, Date.now())
  }
}

async function gather({ query, location, sources }: Query): Promise<void> {
  await Promise.all([
    refreshFeeds(),
    sources.includes('nav')
      ? gatherNav(query, location).catch((err) => {
          console.error('[joblowski] nav:', err instanceof NavBusy ? err.message : err)
          throw err instanceof NavBusy ? err : new Error('Arbeidsplassen did not answer')
        })
      : undefined,
  ])
}

export async function sourceStatus(): Promise<SourceStatus[]> {
  const state = await db.select().from(joblowskiSourceState)
  return state.map((s) => ({
    source: s.source,
    count: s.lastCount,
    fetchedAt: s.fetchedAt?.toISOString() ?? null,
    error: s.lastError,
  }))
}

export async function search(uid: string, q: Query): Promise<{ results: Listing[]; status: SourceStatus[]; warning: string | null }> {
  let warning: string | null = null
  await gather(q).catch((err: Error) => {
    warning = err.message
  })
  const [results, status] = await Promise.all([matching(uid, q), sourceStatus()])
  return { results, status, warning }
}

/** Runs one alert, recording what it has not found before. */
async function runAlert(search: typeof joblowskiSavedSearches.$inferSelect): Promise<number> {
  const sources = search.sources.filter((s): s is SourceKey => (SOURCE_KEYS as string[]).includes(s))
  const q: Query = { query: search.query, location: search.location, sources, filters: readFilters(search.filters) }
  await gather(q)
  const found = await matching(search.ownerUid, q)
  // The first run sets the baseline: what already exists is not news.
  const firstRun = search.lastRunAt === null
  let added = 0
  if (found.length) {
    const inserted = await db
      .insert(joblowskiHits)
      .values(found.map((l) => ({ searchId: search.id, listingId: l.id, ownerUid: search.ownerUid, seenAt: firstRun ? new Date() : null })))
      .onConflictDoNothing()
      .returning({ id: joblowskiHits.listingId })
    // A dismissed ad is recorded like any other, so Restore can bring it back, but it is not news.
    const dismissed = new Set(found.filter((l) => l.dismissed).map((l) => l.id))
    added = firstRun ? 0 : inserted.filter((r) => !dismissed.has(r.id)).length
  }
  await db.update(joblowskiSavedSearches).set({ lastRunAt: new Date() }).where(eq(joblowskiSavedSearches.id, search.id))
  return added
}

/** "Check now": every alert the person has, whenever it last ran. */
export async function checkAlertsFor(uid: string): Promise<{ added: number; warning: string | null }> {
  const searches = await db
    .select()
    .from(joblowskiSavedSearches)
    .where(and(eq(joblowskiSavedSearches.ownerUid, uid), eq(joblowskiSavedSearches.alert, true)))
  let added = 0
  let warning: string | null = null
  for (const s of searches) {
    try {
      added += await runAlert(s)
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err)
    }
  }
  return { added, warning }
}

/** The background job: alerts that are due, for everyone. */
export async function checkDueAlerts(): Promise<void> {
  const { rows } = await db.execute<{ id: string }>(sql`
    SELECT id FROM joblowski.saved_searches
    WHERE alert AND (last_run_at IS NULL OR last_run_at < now() - make_interval(hours => ${ALERT_INTERVAL_HOURS}))`)
  if (rows.length) {
    const due = await db.select().from(joblowskiSavedSearches).where(inArray(joblowskiSavedSearches.id, rows.map((r) => r.id)))
    for (const s of due) await runAlert(s).catch((err) => console.error(`[joblowski] alert ${s.id}:`, err))
  }
  await db.execute(sql`DELETE FROM joblowski.listings WHERE last_seen_at < now() - make_interval(days => ${LISTING_KEEP_DAYS})`)
}

export async function listSaved(uid: string): Promise<SavedSearch[]> {
  const rows = await db
    .select({
      id: joblowskiSavedSearches.id,
      name: joblowskiSavedSearches.name,
      query: joblowskiSavedSearches.query,
      location: joblowskiSavedSearches.location,
      sources: joblowskiSavedSearches.sources,
      filters: joblowskiSavedSearches.filters,
      alert: joblowskiSavedSearches.alert,
      lastRunAt: joblowskiSavedSearches.lastRunAt,
      unseen: sql<number>`(SELECT count(*)::int FROM joblowski.hits h JOIN joblowski.listings l ON l.id = h.listing_id
        WHERE h.search_id = joblowski.saved_searches.id AND h.seen_at IS NULL AND ${NOT_DISMISSED})`,
    })
    .from(joblowskiSavedSearches)
    .where(eq(joblowskiSavedSearches.ownerUid, uid))
    .orderBy(joblowskiSavedSearches.rank, joblowskiSavedSearches.createdAt)
  return rows.map((r) => ({ ...r, sources: r.sources as SourceKey[], filters: readFilters(r.filters), lastRunAt: r.lastRunAt?.toISOString() ?? null }))
}

export async function createSaved(uid: string, input: { name: string; query: string; location: string; sources: SourceKey[]; filters: SearchFilters; alert: boolean }) {
  // New searches go to the bottom of the ladder, the broad end.
  const [{ rank }] = await db
    .select({ rank: sql<number>`coalesce(max(${joblowskiSavedSearches.rank}), 0) + 1` })
    .from(joblowskiSavedSearches)
    .where(eq(joblowskiSavedSearches.ownerUid, uid))
  const [row] = await db.insert(joblowskiSavedSearches).values({ ownerUid: uid, ...input, rank }).returning()
  // Run at once so the baseline exists and the next check can report real news.
  if (row.alert) await runAlert(row).catch((err) => console.error('[joblowski] first alert run:', err))
  return { id: row.id }
}

export async function updateSaved(uid: string, id: string, alert: boolean) {
  await db.update(joblowskiSavedSearches).set({ alert }).where(and(eq(joblowskiSavedSearches.id, id), eq(joblowskiSavedSearches.ownerUid, uid)))
  if (!alert) await db.update(joblowskiHits).set({ seenAt: new Date() }).where(and(eq(joblowskiHits.searchId, id), eq(joblowskiHits.ownerUid, uid), isNull(joblowskiHits.seenAt)))
  return { ok: true }
}

/** The ladder's order, top to bottom: narrow searches first. */
export async function reorderSaved(uid: string, ids: unknown) {
  if (!Array.isArray(ids)) throw new JoblowskiError('Send the searches in order')
  for (const [i, id] of ids.entries()) {
    await db.update(joblowskiSavedSearches).set({ rank: i + 1 }).where(and(eq(joblowskiSavedSearches.id, String(id)), eq(joblowskiSavedSearches.ownerUid, uid)))
  }
  return { ok: true }
}

export async function deleteSaved(uid: string, id: string) {
  await db.delete(joblowskiSavedSearches).where(and(eq(joblowskiSavedSearches.id, id), eq(joblowskiSavedSearches.ownerUid, uid)))
  return { ok: true }
}

export async function newHits(uid: string): Promise<NewHit[]> {
  const { rows } = await db.execute<Row>(sql`
    SELECT DISTINCT ON (l.id) ${LISTING_COLUMNS(uid)}, s.name AS search_name
    FROM joblowski.hits h
    JOIN joblowski.listings l ON l.id = h.listing_id
    JOIN joblowski.saved_searches s ON s.id = h.search_id
    WHERE h.owner_uid = ${uid} AND h.seen_at IS NULL AND ${NOT_DISMISSED}
    ORDER BY l.id`)
  rows.sort((a, b) => (iso(b.published_at) ?? '').localeCompare(iso(a.published_at) ?? ''))
  const { rows: found } = await db.execute<{ listing_id: string; ids: string[] }>(sql`
    SELECT h.listing_id, array_agg(DISTINCT h.search_id) AS ids
    FROM joblowski.hits h
    WHERE h.owner_uid = ${uid} AND h.seen_at IS NULL
    GROUP BY h.listing_id`)
  const by = new Map(found.map((f) => [f.listing_id, f.ids]))
  return dedupe(rows).map((r) => ({ ...toListing(r), searchName: r.search_name ?? '', searchIds: by.get(r.id) ?? [] }))
}

export async function unseenCount(uid: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT h.listing_id)::int AS n
    FROM joblowski.hits h JOIN joblowski.listings l ON l.id = h.listing_id
    WHERE h.owner_uid = ${uid} AND h.seen_at IS NULL AND ${NOT_DISMISSED}`)
  return rows[0].n
}

export async function markAllSeen(uid: string) {
  await db.update(joblowskiHits).set({ seenAt: new Date() }).where(and(eq(joblowskiHits.ownerUid, uid), isNull(joblowskiHits.seenAt)))
  return { ok: true }
}

/** The badge and the per-alert counts, which a dismissal changes. */
async function alertCounts(uid: string) {
  const [unseen, saved] = await Promise.all([unseenCount(uid), listSaved(uid)])
  return { unseen, saved }
}

/** "Not this one": the ad leaves the alerts and stays out, from any source, until restored. */
export async function dismiss(uid: string, listingId: string) {
  if (!listingId) throw new JoblowskiError('Which listing?')
  await db.execute(sql`
    INSERT INTO joblowski.dismissed (owner_uid, ad_key, title, company)
    SELECT ${uid}, ad_key, title, company FROM joblowski.listings WHERE id = ${listingId}
    ON CONFLICT DO NOTHING`)
  return alertCounts(uid)
}

export async function restore(uid: string, listingId: string) {
  if (!listingId) throw new JoblowskiError('Which listing?')
  await db.execute(sql`
    DELETE FROM joblowski.dismissed d USING joblowski.listings l
    WHERE d.owner_uid = ${uid} AND l.id = ${listingId} AND d.ad_key = l.ad_key`)
  return alertCounts(uid)
}
