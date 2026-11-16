/**
 * Where jobs are, and walks between them.
 *
 * Addresses are looked up with OpenStreetMap's Nominatim, which asks for at
 * most one request a second and an honest User-Agent; requests here queue to
 * keep to that. Walking routes come from the OSRM foot router that
 * openstreetmap.de runs. Both are free services meant for light use, which
 * one person planning walks is.
 */
import { JoblowskiError } from './store'

const UA = 'janki-joblowski/1.0 (personal job-search map)'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

export type LatLon = { lat: number; lon: number }
export type Place = LatLon & { label: string }

const cache = new Map<string, Place | null>()
let queue: Promise<unknown> = Promise.resolve()
let last = 0

/** The coordinates of an address, or null if OpenStreetMap does not know it. */
export function geocode(address: string): Promise<Place | null> {
  const key = address.trim().toLowerCase()
  if (!key) return Promise.resolve(null)
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null)
  const job = queue.then(async () => {
    const wait = last + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    // An address without a city is most likely in Oslo, where this is used.
    const q = /oslo|\d{4}/i.test(address) ? address : `${address}, Oslo`
    const url = `${NOMINATIM}?${new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'no' })}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nb,en' }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new JoblowskiError('The address lookup is not answering just now. Try again in a minute', 502)
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    const place = hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name } : null
    cache.set(key, place)
    return place
  })
  queue = job.catch(() => undefined)
  return job
}

const R = 6371000
/** Straight-line metres between two points. */
export function metres(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * A short loop from home through every stop and back: nearest neighbour,
 * then 2-opt until no swap shortens it. Exact answers are not worth the time
 * for ten stops on foot; this is within a few percent.
 */
export function shortLoop<T extends LatLon>(home: LatLon, stops: T[]): T[] {
  if (stops.length < 3) return [...stops]
  const left = [...stops]
  const order: T[] = []
  let at: LatLon = home
  while (left.length) {
    let best = 0
    for (let i = 1; i < left.length; i++) if (metres(at, left[i]) < metres(at, left[best])) best = i
    at = left[best]
    order.push(...left.splice(best, 1))
  }
  const pt = (i: number) => (i < 0 || i >= order.length ? home : order[i])
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const before = metres(pt(i - 1), pt(i)) + metres(pt(k), pt(k + 1))
        const after = metres(pt(i - 1), pt(k)) + metres(pt(i), pt(k + 1))
        if (after + 0.5 < before) {
          order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse())
          improved = true
        }
      }
    }
  }
  return order
}

export type WalkRoute = {
  /** Metres and seconds, the whole loop. */
  distance: number
  duration: number
  /** One per stretch: home to the first stop, …, the last stop back home. */
  legs: { distance: number; duration: number }[]
  /** [lat, lon] pairs along the streets. */
  line: [number, number][]
}

/** The walking route through points in order, by the streets. */
export async function walkingRoute(points: LatLon[]): Promise<WalkRoute> {
  if (points.length < 2) throw new JoblowskiError('A walk needs at least one stop')
  if (points.length > 60) throw new JoblowskiError('Keep a walk under 60 stops')
  const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  let res: Response
  try {
    res = await fetch(`${OSRM_FOOT}/${coords}?overview=full&geometries=geojson&steps=false`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new JoblowskiError('The walking router did not answer. Try again in a minute', 502)
  }
  const body = (await res.json().catch(() => null)) as {
    code?: string
    routes?: { distance: number; duration: number; legs: { distance: number; duration: number }[]; geometry: { coordinates: [number, number][] } }[]
  } | null
  const route = body?.code === 'Ok' ? body.routes?.[0] : undefined
  if (!route) throw new JoblowskiError('No walking route was found between those places', 502)
  return {
    distance: route.distance,
    duration: route.duration,
    legs: route.legs.map((l) => ({ distance: l.distance, duration: l.duration })),
    line: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
  }
}
