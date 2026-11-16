/**
 * Where job ads come from. Each source is reached only through a public JSON
 * endpoint its owner offers, and every listing links back to the original ad,
 * which Remotive, Remote OK, Arbeitnow and Jobicy all ask for.
 *
 * Arbeidsplassen's endpoint is the one its own website calls. It is not a
 * documented API and it also returns FINN's ads, which NAV does not license for
 * reuse, so it suits one person's searches and nothing more. A public version
 * of this app must use NAV's stilling-feed instead.
 */
import { isHttpUrl, type SourceKey } from './types'

export type NormalListing = {
  id: string
  source: SourceKey
  title: string
  company: string
  location: string
  remote: boolean
  url: string
  description: string
  tags: string
  salary: string | null
  publishedAt: Date | null
  expiresOn: string | null
}

const MAX_DESCRIPTION = 20_000
const USER_AGENT = 'janki-joblowski/0.1 (personal job search)'

class HttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | null) {
    super(`answered ${status}`)
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) })
  if (!res.ok) {
    const after = Number(res.headers.get('retry-after'))
    throw new HttpError(res.status, after > 0 ? after * 1000 : null)
  }
  return res.json()
}

const NAV_GAP_MS = 8000
const NAV_COOL_MS = 15 * 60_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let navTurn: Promise<unknown> = Promise.resolve()
let navLastAt = 0
let navCoolUntil = 0

/** NAV has said 429; nothing is asked of it for a while. A search shows what is already here; an alert waits for its next turn. */
export class NavBusy extends Error {
  constructor() {
    super('Arbeidsplassen is rate-limiting us just now; showing what it answered before')
  }
}

/**
 * NAV blocks a machine for minutes after a burst of requests, so every
 * request to it queues here, seconds apart whoever is asking, and a 429
 * starts a cooling-off period instead of a retry.
 */
function navGet(url: string): Promise<unknown> {
  const mine = navTurn.then(async () => {
    if (Date.now() < navCoolUntil) throw new NavBusy()
    const wait = navLastAt + NAV_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      return await getJson(url)
    } catch (err) {
      if (err instanceof HttpError && err.status === 429) {
        navCoolUntil = Date.now() + (err.retryAfterMs ?? NAV_COOL_MS)
        throw new NavBusy()
      }
      throw err
    } finally {
      navLastAt = Date.now()
    }
  })
  navTurn = mine.catch(() => undefined)
  return mine
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole
  })
}

/** Remote OK serves UTF-8 that has been decoded once as Latin-1 ("weâ€™ve"). */
function repairEncoding(text: string): string {
  if (!/[\u0080-\u009f]|Ã[\u0080-¿]|â\u0080/.test(text)) return text
  const repaired = Buffer.from(text, 'latin1').toString('utf8')
  return repaired.includes('�') ? text : repaired
}

const clean = (text: unknown) => decodeEntities(repairEncoding(String(text ?? ''))).replace(/\s+/g, ' ').trim()

export function plainText(html: unknown): string {
  const text = String(html ?? '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return clean(text).slice(0, MAX_DESCRIPTION)
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

const money = (n: number) => Math.round(n).toLocaleString('en-US')

function salaryRange(min: unknown, max: unknown, currency = ''): string | null {
  const low = Number(min)
  const high = Number(max)
  if (!(low > 0) && !(high > 0)) return null
  const range = low > 0 && high > 0 && low !== high ? `${money(low)}–${money(high)}` : money(low > 0 ? low : high)
  return `${currency} ${range}`.trim()
}

type Raw = Record<string, unknown>
const asRaw = (v: unknown) => (v ?? {}) as Raw
const words = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean).join(', ') : clean(v))

async function arbeitnow(): Promise<NormalListing[]> {
  const out: NormalListing[] = []
  for (let page = 1; page <= 3; page++) {
    const body = asRaw(await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`))
    for (const raw of (body.data ?? []) as Raw[]) {
      out.push({
        id: `arbeitnow:${raw.slug}`,
        source: 'arbeitnow',
        title: clean(raw.title),
        company: clean(raw.company_name),
        location: clean(raw.location),
        remote: raw.remote === true,
        url: String(raw.url),
        description: plainText(raw.description),
        tags: [words(raw.tags), words(raw.job_types)].filter(Boolean).join(', '),
        salary: null,
        publishedAt: parseDate(raw.created_at),
        expiresOn: null,
      })
    }
  }
  return out
}

async function remotive(): Promise<NormalListing[]> {
  const body = asRaw(await getJson('https://remotive.com/api/remote-jobs'))
  return ((body.jobs ?? []) as Raw[]).map((raw) => ({
    id: `remotive:${raw.id}`,
    source: 'remotive',
    title: clean(raw.title),
    company: clean(raw.company_name),
    location: clean(raw.candidate_required_location),
    remote: true,
    url: String(raw.url),
    description: plainText(raw.description),
    tags: [words(raw.tags), clean(raw.category)].filter(Boolean).join(', '),
    salary: clean(raw.salary) || null,
    publishedAt: parseDate(raw.publication_date),
    expiresOn: null,
  }))
}

async function remoteok(): Promise<NormalListing[]> {
  const body = (await getJson('https://remoteok.com/api')) as Raw[]
  // The first element is the API's legal notice rather than a job.
  return body.filter((raw) => raw.id && raw.position).map((raw) => ({
    id: `remoteok:${raw.id}`,
    source: 'remoteok',
    title: clean(raw.position),
    company: clean(raw.company),
    location: clean(raw.location),
    remote: true,
    url: String(raw.url),
    description: plainText(raw.description),
    tags: words(raw.tags),
    salary: salaryRange(raw.salary_min, raw.salary_max, 'USD'),
    publishedAt: parseDate(raw.epoch ?? raw.date),
    expiresOn: null,
  }))
}

async function jobicy(): Promise<NormalListing[]> {
  const body = asRaw(await getJson('https://jobicy.com/api/v2/remote-jobs?count=100'))
  return ((body.jobs ?? []) as Raw[]).map((raw) => ({
    id: `jobicy:${raw.id}`,
    source: 'jobicy',
    title: clean(raw.jobTitle),
    company: clean(raw.companyName),
    location: clean(raw.jobGeo),
    remote: true,
    url: String(raw.url),
    description: plainText(raw.jobDescription),
    tags: [words(raw.jobIndustry), words(raw.jobType), clean(raw.jobLevel)].filter(Boolean).join(', '),
    salary: salaryRange(raw.salaryMin, raw.salaryMax, String(raw.salaryCurrency ?? '')),
    publishedAt: parseDate(raw.pubDate),
    expiresOn: null,
  }))
}

/** Every source that can only be read whole, then searched here. */
export const FEEDS: Record<Exclude<SourceKey, 'nav'>, () => Promise<NormalListing[]>> = { arbeitnow, remotive, remoteok, jobicy }

const COUNTIES = new Set([
  'OSLO', 'AKERSHUS', 'BUSKERUD', 'VESTFOLD', 'ØSTFOLD', 'TELEMARK', 'AGDER', 'ROGALAND', 'VESTLAND',
  'MØRE OG ROMSDAL', 'TRØNDELAG', 'NORDLAND', 'TROMS', 'FINNMARK', 'INNLANDET',
])

const titleCase = (text: string) => text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, c: string) => gap + c.toUpperCase())

function navDue(properties: Raw, expires: unknown): string | null {
  const due = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(properties.applicationdue ?? '').trim())
  if (due) return `${due[3]}-${due[2]}-${due[1]}`
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(String(expires ?? ''))
  return iso ? iso[0] : null
}

/** NAV has far too many ads to copy, so it is asked each time, by relevance. */
export async function searchNav(query: string, location: string): Promise<NormalListing[]> {
  const params = new URLSearchParams({ size: '100' })
  // NAV has no operators; quotes, OR and exclusions are applied here afterwards.
  const terms = query.replace(/"/g, ' ').replace(/(^|\s)-\S+/g, ' ').replace(/\s+or\s+/gi, ' ').trim()
  if (terms) params.set('q', terms)
  const county = location.trim().toUpperCase()
  if (COUNTIES.has(county)) params.set('county', county)

  const body = asRaw(await navGet(`https://arbeidsplassen.nav.no/stillinger/api/search?${params}`))
  const hits = (asRaw(body.hits).hits ?? []) as Raw[]
  return hits.map((hit) => {
    const ad = asRaw(hit._source)
    const properties = asRaw(ad.properties)
    const places = ((ad.locationList ?? []) as Raw[]).flatMap((p) => [p.city, p.municipal, p.county]).filter(Boolean).map((p) => titleCase(String(p)))
    const summary = asRaw(ad.generatedSearchMetadata).shortSummary
    const categories = ((ad.categoryList ?? []) as Raw[]).map((c) => clean(c.name))
    return {
      id: `nav:${ad.uuid}`,
      source: 'nav' as const,
      title: clean(ad.title),
      company: clean(ad.businessName ?? asRaw(ad.employer).name),
      location: [...new Set(places)].join(', '),
      remote: false,
      url: `https://arbeidsplassen.nav.no/stillinger/stilling/${ad.uuid}`,
      description: clean(summary),
      tags: [words(properties.searchtagsai), clean(properties.keywords), clean(properties.jobtitle), ...categories].filter(Boolean).join(', '),
      salary: null,
      publishedAt: parseDate(ad.published),
      expiresOn: navDue(properties, ad.expires),
    }
  })
}

export const usable = (listing: NormalListing) => Boolean(listing.title) && isHttpUrl(listing.url)
