'use client'

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { boardUrl } from '../lib/boards'
import { describePay, nokAYear } from '../lib/pay'
import {
  describeFilters,
  LANGUAGE_LABEL,
  NO_FILTERS,
  SOURCES,
  SOURCE_KEYS,
  sourceLabel,
  type CustomBoard,
  type Listing,
  type NewHit,
  type Rates,
  type SavedSearch,
  type SearchFilters,
  type SearchSuggestion,
  type SourceKey,
  type SourceStatus,
} from '../lib/types'
import { ago, api, inputClass, message, primaryClass, secondaryClass, shortDate } from './ui'

type Results = { results: Listing[]; status: SourceStatus[]; warning: string | null }
type AlertData = { hits: NewHit[]; saved: SavedSearch[]; status: SourceStatus[]; added?: number; warning?: string | null }
type Counts = { unseen: number; saved: SavedSearch[] }
type RatesData = { rates: Rates; updatedAt: string | null }
type Sort = 'relevance' | 'pay'

const DAYS: [number | null, string][] = [[null, 'any time'], [1, 'today'], [3, '3 days'], [7, 'a week'], [14, '2 weeks'], [30, 'a month']]
const selectClass = 'rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800'

function ListingRow({ listing, tag, rates, onTrack, onPark, onDismiss, onRestore }: {
  listing: Listing
  tag?: string
  rates: Rates | null
  onTrack: (l: Listing) => void
  /** Into the tracker as parked: kept for later, with no to-do. */
  onPark: (l: Listing) => void
  onDismiss: (l: Listing) => void
  onRestore: (l: Listing) => void
}) {
  const home = SOURCES.find((s) => s.key === listing.source)?.home
  const pay = listing.pay ? describePay(listing.pay, rates) : null
  return (
    <li className={`border-b border-gray-100 py-3 last:border-0 ${listing.dismissed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={listing.url} target="_blank" rel="noopener" className="font-medium text-gray-900 hover:text-sky-800 hover:underline break-words">
            {listing.title}
          </a>
          <p className="text-sm text-gray-700 break-words">
            {[listing.company, listing.location || (listing.remote ? 'Remote' : '')].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {tag && <span className="mr-2 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">New · {tag}</span>}
            {listing.dismissed && <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">Dismissed</span>}
            via <a href={home} target="_blank" rel="noopener" className="underline hover:text-gray-800">{sourceLabel(listing.source)}</a>
            {listing.publishedAt && <> · posted {shortDate(listing.publishedAt)}</>}
            {listing.expiresOn && <> · due {shortDate(listing.expiresOn)}</>}
            {listing.language && listing.language !== 'en' && <> · {LANGUAGE_LABEL[listing.language] ?? listing.language}</>}
            {!pay && listing.salary && <> · {listing.salary}</>}
          </p>
          {pay && (
            <p className="mt-0.5 text-xs text-gray-700">
              Pay: {pay.stated}
              {pay.converted && <span className="text-gray-500"> {pay.converted}</span>}
            </p>
          )}
          {listing.snippet && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{listing.snippet}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {listing.dismissed ? (
            <button className={secondaryClass} onClick={() => onRestore(listing)}>Restore</button>
          ) : listing.trackedStatus === 'parked' ? (
            <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Parked</span>
          ) : listing.trackedId ? (
            <span className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Tracked</span>
          ) : (
            <div className="flex gap-1">
              <button className={secondaryClass} onClick={() => onTrack(listing)}>Track</button>
              <button className={secondaryClass} title="Keep it in the tracker for later, with no to-do" onClick={() => onPark(listing)}>Park</button>
            </div>
          )}
          {!listing.dismissed && (
            <button className="text-xs text-gray-500 hover:text-red-700" onClick={() => onDismiss(listing)}>Dismiss</button>
          )}
        </div>
      </div>
    </li>
  )
}

export default function SearchTab({ initialSaved, boards, hits, setHits, onTracked }: {
  initialSaved: SavedSearch[]
  boards: CustomBoard[]
  hits: NewHit[]
  setHits: Dispatch<SetStateAction<NewHit[]>>
  onTracked: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('Oslo')
  const [sources, setSources] = useState<SourceKey[]>(SOURCE_KEYS)
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS)
  const [results, setResults] = useState<Listing[] | null>(null)
  const [sort, setSort] = useState<Sort>('relevance')
  const [status, setStatus] = useState<SourceStatus[]>([])
  const [saved, setSaved] = useState(initialSaved)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [suggestions, setSuggestions] = useState<SearchSuggestion[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [rates, setRates] = useState<RatesData | null>(null)
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({})
  const [showRates, setShowRates] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<Listing | null>(null)
  /** The alert whose new jobs the list is narrowed to, if any. */
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    api<RatesData>('/api/joblowski/rates').then(setRates).catch(() => {})
  }, [])

  const attempt = async (label: string, run: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await run()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
    }
  }

  const fetchSearch = (q: string, l: string, s: SourceKey[], f: SearchFilters) =>
    api<Results>('/api/joblowski/search', 'POST', { query: q, location: l, sources: s, filters: f })

  const runSearch = (q: string, l: string, s: SourceKey[], f: SearchFilters) =>
    attempt('search', async () => {
      setNote(null)
      setUndo(null)
      const body = await fetchSearch(q, l, s, f)
      setResults(body.results)
      setStatus(body.status)
      setNote(body.warning)
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void runSearch(query, location, sources, filters)
  }

  const fill = (s: SavedSearch) => {
    setQuery(s.query)
    setLocation(s.location)
    setSources(s.sources)
    setFilters(s.filters)
  }

  const loadSaved = (s: SavedSearch) => {
    fill(s)
    void runSearch(s.query, s.location, s.sources, s.filters)
  }

  const applyAlerts = (body: AlertData) => {
    setHits(body.hits)
    setSaved(body.saved)
    setStatus(body.status)
  }

  const refreshAlerts = async () => applyAlerts(await api<AlertData>('/api/joblowski/alerts'))

  const saveAlert = () =>
    attempt('save', async () => {
      await api('/api/joblowski/saved', 'POST', { query, location, sources, filters, alert: true })
      await refreshAlerts()
      setNote('Alert saved, at the bottom of the ladder. Listings that exist today are the baseline, and you will see anything new after this.')
    })

  const checkNow = () =>
    attempt('check', async () => {
      const body = await api<AlertData>('/api/joblowski/alerts', 'POST', { action: 'check' })
      applyAlerts(body)
      setNote(body.warning ?? (body.added ? `${body.added} new ${body.added === 1 ? 'match' : 'matches'}.` : 'Nothing new since the last check.'))
    })

  /** Narrow first: runs every saved search in order and opens the first rung with jobs on it. */
  const runLadder = () =>
    attempt('ladder', async () => {
      setNote(null)
      setUndo(null)
      const found: Record<string, number> = {}
      let first: { s: SavedSearch; body: Results } | null = null
      for (const s of saved) {
        const body = await fetchSearch(s.query, s.location, s.sources, s.filters)
        found[s.id] = body.results.length
        setCounts({ ...found })
        if (!first && body.results.length) first = { s, body }
        setStatus(body.status)
      }
      if (first) {
        fill(first.s)
        setResults(first.body.results)
        setNote(`Working the ladder from the top: "${first.s.name}" is the first rung with jobs on it.`)
      } else {
        setResults([])
        setNote('Every rung of the ladder is empty just now.')
      }
    })

  const move = (s: SavedSearch, dir: -1 | 1) =>
    attempt('order', async () => {
      const ids = saved.map((x) => x.id)
      const i = ids.indexOf(s.id)
      const j = i + dir
      if (j < 0 || j >= ids.length) return
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      setSaved(ids.map((id) => saved.find((x) => x.id === id)!))
      await api('/api/joblowski/saved', 'PATCH', { order: ids })
    })

  const markSeen = () =>
    attempt('seen', async () => {
      await api('/api/joblowski/alerts', 'POST', { action: 'seen' })
      setHits([])
      setFocus(null)
      setSaved((all) => all.map((s) => ({ ...s, unseen: 0 })))
      window.dispatchEvent(new CustomEvent('joblowski:unseen', { detail: 0 }))
    })

  const toggleAlert = (s: SavedSearch) =>
    attempt('toggle', async () => {
      await api(`/api/joblowski/saved/${s.id}`, 'PATCH', { alert: !s.alert })
      await refreshAlerts()
    })

  const removeSaved = (s: SavedSearch) =>
    attempt('remove', async () => {
      await api(`/api/joblowski/saved/${s.id}`, 'DELETE')
      await refreshAlerts()
    })

  const suggest = () =>
    attempt('suggest', async () => {
      const { searches } = await api<{ searches: SearchSuggestion[] }>('/api/joblowski/saved/suggest', 'POST')
      setSuggestions(searches)
      setChosen(new Set(searches.map((_, i) => i)))
      if (searches.length === 0) setNote('Claude found nothing to add to the searches you have.')
    })

  const saveSuggestions = () =>
    attempt('save', async () => {
      if (!suggestions) return
      let n = 0
      for (const [i, s] of suggestions.entries()) {
        if (!chosen.has(i)) continue
        await api('/api/joblowski/saved', 'POST', { name: s.name, query: s.query, location: s.location, sources: s.sources, filters: s.filters, alert: true })
        n++
      }
      setSuggestions(null)
      await refreshAlerts()
      setNote(`${n} ${n === 1 ? 'search' : 'searches'} saved as alerts, narrowest first. Today is the baseline for each.`)
    })

  const saveRates = (e: FormEvent) => {
    e.preventDefault()
    void attempt('rates', async () => {
      setRates(await api<RatesData>('/api/joblowski/rates', 'PUT', rateDraft))
      setRateDraft({})
      setShowRates(false)
    })
  }

  const track = (listing: Listing, status: 'saved' | 'parked' = 'saved') =>
    attempt('track', async () => {
      const { id } = await api<{ id: string }>('/api/joblowski/applications', 'POST', {
        company: listing.company || 'Unknown company',
        role: listing.title,
        url: listing.url,
        location: listing.location,
        source: listing.source,
        dueDate: listing.expiresOn,
        status,
      })
      const mark = <T extends Listing>(all: T[]) => all.map((l) => (l.id === listing.id ? { ...l, trackedId: id, trackedStatus: status } : l))
      setResults((all) => (all ? mark(all) : all))
      setHits(mark)
      await onTracked()
    })

  /** The nav badge and the per-alert counts, which a dismissal changes. */
  const applyCounts = ({ unseen, saved }: Counts) => {
    setSaved(saved)
    window.dispatchEvent(new CustomEvent('joblowski:unseen', { detail: unseen }))
  }

  const markDismissed = (listing: Listing, dismissed: boolean) =>
    setResults((all) => all && all.map((l) => (l.id === listing.id ? { ...l, dismissed } : l)))

  const dismiss = (listing: Listing) =>
    attempt('dismiss', async () => {
      applyCounts(await api<Counts>('/api/joblowski/alerts', 'POST', { action: 'dismiss', listingId: listing.id }))
      setHits((all) => all.filter((l) => l.id !== listing.id))
      markDismissed(listing, true)
      setNote(null)
      setUndo(listing)
    })

  const restore = (listing: Listing) =>
    attempt('restore', async () => {
      applyCounts(await api<Counts>('/api/joblowski/alerts', 'POST', { action: 'restore', listingId: listing.id }))
      markDismissed(listing, false)
      setUndo(null)
      // If an alert had found it, it is news again.
      await refreshAlerts()
    })

  const toggleSource = (key: SourceKey) =>
    setSources((all) => (all.includes(key) ? all.filter((k) => k !== key) : [...all, key]))

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => setFilters((f) => ({ ...f, [key]: value }))

  // Highest stated pay first; ads with no pay, or in a currency with no rate, go last.
  const payOf = (l: Listing) => {
    if (!l.pay || !rates) return -1
    const nok = nokAYear(l.pay, rates.rates)
    return nok ? (nok[1] ?? nok[0]) : -1
  }
  const focused = focus ? saved.find((x) => x.id === focus) ?? null : null
  const focusedHits = focused ? hits.filter((h) => h.searchIds.includes(focused.id)) : hits
  /** With new jobs, an alert's name narrows the list to them; without, it runs the search. */
  const pickAlert = (s: SavedSearch) => {
    if (s.unseen > 0) {
      setFocus((f) => (f === s.id ? null : s.id))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setFocus(null)
      loadSaved(s)
    }
  }
  const shown = results && sort === 'pay' ? [...results].sort((a, b) => payOf(b) - payOf(a)) : results
  const row = (l: Listing, tag?: string) => (
    <ListingRow key={l.id} listing={l} tag={tag} rates={rates?.rates ?? null} onTrack={track} onPark={(x) => track(x, 'parked')} onDismiss={dismiss} onRestore={restore} />
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
      <div className="min-w-0 lg:order-1">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
            <label className="block">
              <span className="sr-only">What</span>
              <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder='data engineer OR "data manager" -senior' />
            </label>
            <label className="block">
              <span className="sr-only">Where</span>
              <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oslo" />
            </label>
            <button className={primaryClass} disabled={busy !== null}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SOURCES.map((s) => (
              <label key={s.key} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${sources.includes(s.key) ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-gray-200 text-gray-500'}`}>
                <input type="checkbox" className="sr-only" checked={sources.includes(s.key)} onChange={() => toggleSource(s.key)} />
                {s.label} <span className="opacity-70">{s.region}</span>
              </label>
            ))}
            <button type="button" className="ml-auto text-sm text-sky-800 hover:underline disabled:opacity-50" disabled={busy !== null || (!query.trim() && !location.trim())} onClick={saveAlert}>
              Save as alert
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
            <label className="flex items-center gap-1">
              Posted
              <select className={selectClass} value={filters.days ?? ''} onChange={(e) => setFilter('days', e.target.value ? Number(e.target.value) : null)}>
                {DAYS.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Language
              <select className={selectClass} value={filters.language} onChange={(e) => setFilter('language', e.target.value as SearchFilters['language'])}>
                <option value="">any</option>
                <option value="en">English</option>
                <option value="no">Norwegian</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" className="accent-sky-700" checked={filters.soon} onChange={(e) => setFilter('soon', e.target.checked)} /> Starting soon
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" className="accent-sky-700" checked={filters.paid} onChange={(e) => setFilter('paid', e.target.checked)} /> With pay
            </label>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>Open this search on</span>
            {/* Boards that cannot be searched from here (ticked "on Search" under Job boards), opened with the words filled in. */}
            {boards.filter((b) => b.quick).map((b) => (
              <a key={b.id} href={boardUrl(b.urlTemplate, query, location)} target="_blank" rel="noopener" className="text-sky-800 hover:underline" title={b.note || undefined}>{b.name}</a>
            ))}
          </p>
        </form>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {note && <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">{note}</p>}
        {undo && (
          <p className="mt-4 flex flex-wrap items-center gap-x-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <span>
              Dismissed <span className="font-medium text-gray-900">{undo.title}</span>. It stays out of your alerts, even if another board lists it.
            </span>
            <button className="text-sky-800 hover:underline" onClick={() => restore(undo)}>Undo</button>
          </p>
        )}

        {suggestions && (
          <section className="mt-4 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900">Suggested searches, narrowest first</h2>
              <span className="flex gap-3 text-sm">
                <button className={primaryClass} disabled={busy !== null || chosen.size === 0} onClick={saveSuggestions}>Save {chosen.size} as alerts</button>
                <button className="text-gray-500 hover:text-gray-900" onClick={() => setSuggestions(null)}>Close</button>
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-600">From your résumés, letters and facts. Untick any you do not want; the order becomes the ladder.</p>
            <ul className="mt-3 space-y-2">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-1 accent-sky-700" checked={chosen.has(i)} onChange={(e) => setChosen((all) => { const next = new Set(all); if (e.target.checked) next.add(i); else next.delete(i); return next })} aria-label={`Keep ${s.name}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">
                      <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">Tier {s.tier}</span>
                      {s.name}
                    </p>
                    <p className="text-gray-700 break-words"><code className="text-xs">{s.query}</code>{s.location && <> · {s.location}</>}{describeFilters(s.filters) && <> · {describeFilters(s.filters)}</>} · {s.sources.map(sourceLabel).join(', ')}</p>
                    <p className="text-xs text-gray-500">{s.why}</p>
                  </div>
                  <button className="text-xs text-sky-800 hover:underline" onClick={() => { setQuery(s.query); setLocation(s.location); setSources(s.sources); setFilters(s.filters); void runSearch(s.query, s.location, s.sources, s.filters) }}>Try</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hits.length > 0 && (
          <section className="mt-6">
            {focused ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">
                  New from <span className="text-sky-800">{focused.name}</span> <span className="font-normal text-gray-500">({focusedHits.length})</span>
                </h2>
                <span className="flex gap-3 text-sm">
                  <button className="text-sky-800 hover:underline" onClick={() => loadSaved(focused)}>Run this search</button>
                  <button className="text-sky-800 hover:underline" onClick={() => setFocus(null)}>Show all alerts</button>
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">New from your alerts</h2>
                <button className="text-sm text-sky-800 hover:underline" onClick={markSeen}>Mark all as seen</button>
              </div>
            )}
            {focused && focusedHits.length === 0 && <p className="mt-2 text-sm text-gray-500">Nothing new left from this alert.</p>}
            <ul>{focusedHits.map((h) => row(h, focused ? focused.name : h.searchName))}</ul>
          </section>
        )}

        {shown && (
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900">{shown.length} {shown.length === 1 ? 'job' : 'jobs'}</h2>
              <span className="flex items-center gap-3 text-xs text-gray-600">
                <label className="flex items-center gap-1">
                  Sort
                  <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="relevance">by relevance</option>
                    <option value="pay">by pay</option>
                  </select>
                </label>
                <button className="text-sky-800 hover:underline" onClick={() => setShowRates((v) => !v)}>Rates</button>
              </span>
            </div>
            {showRates && rates && (
              <form onSubmit={saveRates} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                {Object.entries(rates.rates).filter(([c]) => c !== 'NOK').sort().map(([c, v]) => (
                  <label key={c} className="block">
                    <span className="block text-gray-500">NOK per {c}</span>
                    <input className={`${inputClass} w-20`} inputMode="decimal" value={rateDraft[c] ?? String(v)} onChange={(e) => setRateDraft((d) => ({ ...d, [c]: e.target.value }))} />
                  </label>
                ))}
                <button className={secondaryClass} disabled={busy !== null}>Save rates</button>
                <span className="text-gray-500">Pay is shown a year, in NOK and CAD, with these. Updated {rates.updatedAt ? shortDate(rates.updatedAt) : 'never'}.</span>
              </form>
            )}
            {shown.length === 0 && <p className="mt-2 text-sm text-gray-500">Nothing matches. Try fewer words, a wider time, or English and Norwegian together: developer OR utvikler.</p>}
            <ul>{shown.map((l) => row(l))}</ul>
          </section>
        )}

        {!results && hits.length === 0 && (
          <div className="mt-6 rounded-xl bg-gray-50 p-5 text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-900">Every word must appear, across all the sources you pick.</p>
            <p>Use <code>&quot;exact phrase&quot;</code>, <code>OR</code> for alternatives, and <code>-word</code> to exclude. Ads are in several languages, so <code>developer OR utvikler</code> finds more.</p>
            <p>Remote jobs open to Europe or worldwide are included whatever place you enter. Narrow further by how recently it was posted, the ad&apos;s language, ads that say they start at once, and ads that state pay.</p>
            <p>Saved searches form a ladder: keep the narrow ones at the top and <span className="text-gray-800">Run in order</span> opens the first rung with jobs on it.</p>
          </div>
        )}

        {status.length > 0 && (
          <p className="mt-6 text-xs text-gray-500">
            {status.map((s) => (
              <span key={s.source} className="mr-3 inline-block">
                {sourceLabel(s.source)}: {s.error ? <span className="text-red-700">failed ({s.error})</span> : <>{s.count} jobs, {ago(s.fetchedAt)}</>}
              </span>
            ))}
            <span className="inline-block">Arbeidsplassen is asked seconds apart for each OR alternative, then remembered for six hours.</span>
          </p>
        )}
      </div>

      <aside className="lg:order-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-900">Alerts</h2>
          <button className="text-sm text-sky-800 hover:underline disabled:opacity-50" disabled={busy !== null || !saved.some((s) => s.alert)} onClick={checkNow}>
            {busy === 'check' ? 'Checking…' : 'Check now'}
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="text-sm text-gray-500">Run a search, then choose <span className="text-gray-800">Save as alert</span>. Janki re-checks every 6 hours and marks anything new here and in the top bar.</p>
        ) : (
          <ul className="space-y-1">
            {saved.map((s, i) => (
              <li key={s.id} className={`group rounded-lg border p-2.5 ${focus === s.id ? 'border-sky-600 bg-sky-50' : 'border-gray-200'}`}>
                <div className="flex items-start gap-1">
                  <button className="block min-w-0 flex-1 text-left text-sm font-medium text-gray-900 hover:text-sky-800 break-words" title={s.unseen > 0 ? 'Show only the new jobs from this alert' : 'Run this search'} onClick={() => pickAlert(s)}>
                    {s.name}
                    {s.unseen > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{s.unseen}</span>}
                  </button>
                  <span className="flex shrink-0 flex-col text-xs leading-none text-gray-400">
                    <button className="hover:text-gray-900 disabled:opacity-30" disabled={i === 0 || busy !== null} aria-label="Move up the ladder" onClick={() => move(s, -1)}>▲</button>
                    <button className="hover:text-gray-900 disabled:opacity-30" disabled={i === saved.length - 1 || busy !== null} aria-label="Move down the ladder" onClick={() => move(s, 1)}>▼</button>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {counts[s.id] !== undefined && <span className={`mr-2 ${counts[s.id] ? 'text-gray-800' : ''}`}>{counts[s.id]} {counts[s.id] === 1 ? 'job' : 'jobs'}</span>}
                    {s.alert ? `Checked ${ago(s.lastRunAt)}` : 'Alert off'}
                  </span>
                  <span className="flex gap-2">
                    <button className="hover:text-gray-900" onClick={() => toggleAlert(s)}>{s.alert ? 'Pause' : 'Resume'}</button>
                    <button className="hover:text-red-700" onClick={() => removeSaved(s)}>Delete</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {saved.length > 1 && (
            <button className="text-sky-800 hover:underline disabled:opacity-50" disabled={busy !== null} onClick={runLadder} title="Narrow searches first; opens the first with jobs">
              {busy === 'ladder' ? 'Running…' : 'Run in order'}
            </button>
          )}
          <button className="text-sky-800 hover:underline disabled:opacity-50" disabled={busy !== null} onClick={suggest} title="Claude reads your résumés and letters and proposes a ladder of searches">
            {busy === 'suggest' ? 'Reading your documents…' : 'Suggest from my documents'}
          </button>
        </div>
      </aside>
    </div>
  )
}
