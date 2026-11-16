'use client'

import 'leaflet/dist/leaflet.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import type { Application, Status } from '../lib/types'
import type { Home, PlannedWalk, Walk } from '../lib/map'
import { api, inputClass, message, primaryClass, secondaryClass } from './ui'

const OPEN: Status[] = ['saved', 'applied', 'interview', 'offer']
const COLOUR: Record<Status, string> = {
  saved: '#64748b',
  applied: '#0369a1',
  interview: '#7c3aed',
  offer: '#15803d',
  rejected: '#b91c1c',
  withdrawn: '#78716c',
  parked: '#b45309',
}
const STATUS_WORD: Record<Status, string> = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn', parked: 'Parked' }

const km = (m: number) => `${(m / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} km`
const mins = (s: number) => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

/** Google Maps walking links; a phone takes up to 9 waypoints, so long walks come in parts. */
function mapsLinks(points: { lat: number; lon: number }[]): string[] {
  const ll = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
  const links: string[] = []
  for (let a = 0; a < points.length - 1; a += 9) {
    const b = Math.min(a + 9, points.length - 1)
    const via = points.slice(a + 1, b)
    links.push(
      `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${ll(points[a])}&destination=${ll(points[b])}` +
        (via.length ? `&waypoints=${encodeURIComponent(via.map(ll).join('|'))}` : ''),
    )
  }
  return links
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export default function MapTab({ applications, reload }: { applications: Application[]; reload: () => Promise<void> }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<Leaflet.Map | null>(null)
  const L = useRef<typeof Leaflet | null>(null)
  const layers = useRef<{ jobs: Leaflet.LayerGroup; route: Leaflet.LayerGroup } | null>(null)
  const fitted = useRef(false)

  const [ready, setReady] = useState(false)
  const [home, setHomeState] = useState<Home | null>(null)
  const [homeText, setHomeText] = useState('')
  const [editingHome, setEditingHome] = useState(false)
  const [walks, setWalks] = useState<Walk[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [planned, setPlanned] = useState<PlannedWalk | null>(null)
  const [walkId, setWalkId] = useState<string | null>(null)
  const [walkName, setWalkName] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState({ company: '', address: '', role: 'Walk-in, kitchen' })

  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications])
  const onMap = applications.filter((a) => a.lat !== null && a.lon !== null && (showAll || OPEN.includes(a.status)))
  const noAddress = applications.filter((a) => a.lat === null && OPEN.includes(a.status))
  const order = planned?.stopIds ?? selected

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  // Home and saved walks.
  useEffect(() => {
    api<{ home: Home | null }>('/api/joblowski/map/home').then((r) => { setHomeState(r.home); setHomeText(r.home?.address ?? ''); setEditingHome(!r.home) }).catch((e) => setError(message(e)))
    api<{ walks: Walk[] }>('/api/joblowski/map/walks').then((r) => setWalks(r.walks)).catch((e) => setError(message(e)))
  }, [])

  // Leaflet only exists in the browser, so it is loaded here.
  useEffect(() => {
    let gone = false
    void import('leaflet').then((mod) => {
      if (gone || !box.current || map.current) return
      const lf = (mod.default ?? mod) as typeof Leaflet
      L.current = lf
      const m = lf.map(box.current, { zoomControl: true }).setView([59.9235, 10.752], 13)
      lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m)
      layers.current = { route: lf.layerGroup().addTo(m), jobs: lf.layerGroup().addTo(m) }
      map.current = m
      setReady(true)
    })
    return () => {
      gone = true
      map.current?.remove()
      map.current = null
    }
  }, [])

  const toggle = useCallback((id: string) => {
    setPlanned(null)
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }, [])

  // Draw home, jobs and the route whenever any of them change.
  useEffect(() => {
    const lf = L.current
    const m = map.current
    if (!ready || !lf || !m || !layers.current) return
    const { jobs, route } = layers.current
    jobs.clearLayers()
    route.clearLayers()

    if (home) {
      lf.marker([home.lat, home.lon], {
        icon: lf.divIcon({ className: '', html: '<div class="jm-home">H</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: `Start: ${home.address}`,
        zIndexOffset: 1000,
      }).addTo(jobs)
    }
    for (const a of onMap) {
      const n = order.indexOf(a.id)
      const html = `<div class="jm-pin${n >= 0 ? ' jm-on' : ''}" style="background:${COLOUR[a.status]}">${n >= 0 ? n + 1 : ''}</div>`
      const mk = lf.marker([a.lat!, a.lon!], { icon: lf.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] }), title: a.company })
      const pop = document.createElement('div')
      pop.className = 'jm-pop'
      pop.innerHTML = `<strong>${esc(a.company)}</strong><br>${esc(a.role)}<br><span style="color:${COLOUR[a.status]}">${STATUS_WORD[a.status]}</span>` +
        (a.address ? `<br><small>${esc(a.address)}</small>` : '') +
        `<div class="jm-actions"><button type="button">${n >= 0 ? 'Take off the walk' : 'Add to the walk'}</button>` +
        `<a href="/joblowski?tab=tracker&job=${encodeURIComponent(a.id)}">Open</a></div>`
      pop.querySelector('button')!.addEventListener('click', () => { toggle(a.id); mk.closePopup() })
      mk.bindPopup(pop).addTo(jobs)
    }
    if (planned) {
      lf.polyline(planned.route.line, { color: '#1f5fd1', weight: 5, opacity: 0.85 }).addTo(route)
    }
    if (!fitted.current && (onMap.length || home)) {
      const pts: [number, number][] = onMap.map((a) => [a.lat!, a.lon!])
      if (home) pts.push([home.lat, home.lon])
      if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 15 })
      else m.setView(pts[0], 15)
      fitted.current = true
    }
  }, [ready, home, onMap, order, planned, toggle])

  const fitAll = () => {
    const m = map.current
    if (!m) return
    const pts: [number, number][] = planned ? planned.route.line : onMap.map((a) => [a.lat!, a.lon!])
    if (home) pts.push([home.lat, home.lon])
    if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 16 })
  }

  const saveHome = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api<{ home: Home }>('/api/joblowski/map/home', 'PUT', { address: homeText })
      setHomeState(r.home)
      setEditingHome(false)
      setPlanned(null)
    })
  }

  const plan = (optimize: boolean) =>
    run(async () => {
      const r = await api<PlannedWalk>('/api/joblowski/map/plan', 'POST', { stopIds: order, optimize })
      setPlanned(r)
      setSelected(r.stopIds)
      setTimeout(fitAll, 0)
    })

  const saveWalk = () =>
    run(async () => {
      if (!planned) return
      const name = walkName.trim() || `Walk, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      if (walkId) await api(`/api/joblowski/map/walks/${walkId}`, 'PATCH', { name, stopIds: planned.stopIds, route: planned.route })
      else setWalkId((await api<{ id: string }>('/api/joblowski/map/walks', 'POST', { name, stopIds: planned.stopIds, route: planned.route })).id)
      setWalkName(name)
      setWalks((await api<{ walks: Walk[] }>('/api/joblowski/map/walks')).walks)
    })

  const openWalk = (w: Walk) => {
    setWalkId(w.id)
    setWalkName(w.name)
    setSelected(w.stopIds.filter((id) => byId.has(id)))
    setPlanned(w.route ? { stopIds: w.stopIds.filter((id) => byId.has(id)), route: w.route } : null)
    setTimeout(fitAll, 0)
  }

  const newWalk = () => {
    setWalkId(null)
    setWalkName('')
    setSelected([])
    setPlanned(null)
  }

  const removeWalk = (w: Walk) =>
    run(async () => {
      if (!window.confirm(`Delete the walk "${w.name}"? The jobs stay in the tracker.`)) return
      await api(`/api/joblowski/map/walks/${w.id}`, 'DELETE')
      setWalks((all) => all.filter((x) => x.id !== w.id))
      if (walkId === w.id) newWalk()
    })

  const addPlace = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api<{ id: string; existed: boolean; located: boolean }>('/api/joblowski/applications', 'POST', {
        company: place.company, role: place.role || 'Walk-in', address: place.address, status: 'saved', source: 'walk-in',
      })
      await reload()
      if (!r.located) throw new Error('Added to the tracker, but OpenStreetMap could not find that address. Fix it under "No address yet".')
      setSelected((s) => [...s, r.id])
      setPlanned(null)
      setPlace({ company: '', address: '', role: place.role })
    })
  }

  const setAddress = (a: Application, address: string) =>
    run(async () => {
      const r = await api<{ located: boolean }>(`/api/joblowski/applications/${a.id}`, 'PATCH', { address })
      await reload()
      if (!r.located) throw new Error(`OpenStreetMap could not find "${address}". Try the street and number, then the city.`)
    })

  const stops = order.map((id) => byId.get(id)).filter((a): a is Application => Boolean(a))
  const links = planned && home ? mapsLinks([home, ...planned.stopIds.map((id) => byId.get(id)!).filter(Boolean).map((a) => ({ lat: a.lat!, lon: a.lon! })), home]) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <style>{`
        .jm-pin, .jm-home { width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35);
          color: #fff; font: 700 12px/21px system-ui, sans-serif; text-align: center; }
        .jm-pin:not(.jm-on) { transform: scale(.75); }
        .jm-home { border-radius: 6px; background: #111827; }
        .jm-pop { font: 13px/1.4 system-ui, sans-serif; min-width: 160px; }
        .jm-actions { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
        .jm-actions button { background: #0369a1; color: #fff; border: 0; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
      `}</style>

      <div className="min-w-0">
        {/* isolate: Leaflet's panes use z-index up to 1000, which would cover janki's sticky header. */}
        <div className="relative isolate">
          <div ref={box} className="h-[60vh] min-h-[340px] w-full overflow-hidden rounded-xl border border-gray-200 lg:h-[calc(100vh-14rem)]" aria-label="Map of tracked jobs" />
          <button className="absolute bottom-3 right-3 z-[500] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs shadow" onClick={fitAll}>Fit</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          {(Object.keys(COLOUR) as Status[]).filter((s) => showAll || OPEN.includes(s)).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOUR[s] }} />{STATUS_WORD[s]}</span>
          ))}
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show closed jobs too</label>
        </div>
      </div>

      <aside className="min-w-0 space-y-4 text-sm">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}

        <section>
          <h3 className="mb-1 font-medium text-gray-900">Walks start from</h3>
          {editingHome ? (
            <form className="flex gap-2" onSubmit={saveHome}>
              <input className={inputClass} value={homeText} onChange={(e) => setHomeText(e.target.value)} placeholder="e.g. Welhavens gate 19B, Oslo" />
              <button className={primaryClass} disabled={busy}>Set</button>
            </form>
          ) : (
            <p className="text-gray-700">{home?.address} <button className="ml-2 text-xs text-sky-800 hover:underline" onClick={() => setEditingHome(true)}>Change</button></p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="font-medium text-gray-900">{walkId ? walkName : 'New walk'} <span className="font-normal text-gray-400">({stops.length})</span></h3>
            {(walkId || stops.length > 0) && <button className="text-xs text-gray-500 hover:text-gray-900" onClick={newWalk}>Start over</button>}
          </div>
          {stops.length === 0 ? (
            <p className="text-gray-500">Tap jobs on the map and choose &ldquo;Add to the walk&rdquo;.</p>
          ) : (
            <ol className="space-y-1">
              {stops.map((a, i) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: COLOUR[a.status] }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {a.company}
                    {planned && <span className="block text-xs text-gray-500">{km(planned.route.legs[i].distance)} · {mins(planned.route.legs[i].duration)} from {i ? `stop ${i}` : 'the start'}</span>}
                  </span>
                  <button className="text-xs text-gray-400 hover:text-red-700" aria-label={`Take ${a.company} off the walk`} onClick={() => toggle(a.id)}>×</button>
                </li>
              ))}
            </ol>
          )}
          {stops.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={primaryClass} disabled={busy || !home} onClick={() => plan(true)}>{busy ? 'Planning…' : 'Plan the shortest loop'}</button>
              <button className={secondaryClass} disabled={busy || !home} onClick={() => plan(false)}>Walk in this order</button>
            </div>
          )}
          {planned && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              <p className="font-medium text-gray-900">{km(planned.route.distance)} · about {mins(planned.route.duration)} walking</p>
              <p className="text-xs text-gray-500">Back home: {km(planned.route.legs.at(-1)!.distance)}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {links.map((href, i) => (
                  <a key={href} className="text-sky-800 hover:underline" href={href} target="_blank" rel="noopener noreferrer">
                    {links.length > 1 ? `Open part ${i + 1} in Maps ↗` : 'Open in Maps ↗'}
                  </a>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={inputClass} value={walkName} onChange={(e) => setWalkName(e.target.value)} placeholder="Name this walk" />
                <button className={secondaryClass} disabled={busy} onClick={saveWalk}>{walkId ? 'Update' : 'Save'}</button>
              </div>
            </div>
          )}
        </section>

        {walks.length > 0 && (
          <section>
            <h3 className="mb-1 font-medium text-gray-900">Saved walks</h3>
            <ul className="divide-y divide-gray-100">
              {walks.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                  <button className={`min-w-0 break-words text-left hover:underline ${w.id === walkId ? 'font-medium text-sky-800' : 'text-gray-800'}`} onClick={() => openWalk(w)}>
                    {w.name} <span className="text-xs text-gray-500">{w.stopIds.length} stops{w.route ? ` · ${km(w.route.distance)}` : ''}</span>
                  </button>
                  <button className="text-xs text-gray-400 hover:text-red-700" onClick={() => removeWalk(w)}>Delete</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1 font-medium text-gray-900">Add a place to walk to</h3>
          <form className="space-y-2" onSubmit={addPlace}>
            <input className={inputClass} placeholder="Name, e.g. Ille brød" value={place.company} onChange={(e) => setPlace({ ...place, company: e.target.value })} />
            <input className={inputClass} placeholder="Address, e.g. Lakkegata 53" value={place.address} onChange={(e) => setPlace({ ...place, address: e.target.value })} />
            <input className={inputClass} placeholder="What for" value={place.role} onChange={(e) => setPlace({ ...place, role: e.target.value })} />
            <button className={primaryClass} disabled={busy || !place.company.trim() || !place.address.trim()}>Add to the map and the walk</button>
          </form>
          <p className="mt-1 text-xs text-gray-500">It goes in the tracker as Saved, so it also shows as a next action on your job search.</p>
        </section>

        {noAddress.length > 0 && (
          <section>
            <h3 className="mb-1 font-medium text-gray-900">No address yet <span className="font-normal text-gray-400">({noAddress.length})</span></h3>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {noAddress.map((a) => <NoAddress key={a.id} app={a} onSave={(address) => setAddress(a, address)} />)}
            </ul>
          </section>
        )}
        <p className="text-xs text-gray-500">Map data and addresses from OpenStreetMap. Walking routes from the OSRM foot router.</p>
      </aside>
    </div>
  )
}

function NoAddress({ app, onSave }: { app: Application; onSave: (address: string) => Promise<void> }) {
  const [text, setText] = useState(app.address ?? '')
  return (
    <li>
      <p className="break-words text-gray-800">{app.company} <span className="text-xs text-gray-500">{app.role}</span></p>
      <form className="mt-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void onSave(text.trim()) }}>
        <input className={`${inputClass} py-1`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Street address" />
        <button className={`${secondaryClass} py-1`}>Place</button>
      </form>
    </li>
  )
}
