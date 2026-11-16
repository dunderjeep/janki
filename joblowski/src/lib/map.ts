/** Joblowski's map: home, saved walks, and planning a walk between tracked jobs. */
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../host'
import { joblowskiApplications, joblowskiMapHome, joblowskiWalks } from '../schema'
import { geocode, shortLoop, walkingRoute, type WalkRoute } from './geo'
import { JoblowskiError } from './store'

export type Home = { address: string; lat: number; lon: number }
export type Walk = { id: string; name: string; stopIds: string[]; route: WalkRoute | null; updatedAt: string }
export type PlannedWalk = { stopIds: string[]; route: WalkRoute }

export async function getHome(uid: string): Promise<Home | null> {
  const [row] = await db.select().from(joblowskiMapHome).where(eq(joblowskiMapHome.ownerUid, uid))
  return row ? { address: row.address, lat: row.lat, lon: row.lon } : null
}

export async function setHome(uid: string, input: { address?: unknown }): Promise<Home> {
  const address = typeof input.address === 'string' ? input.address.trim().slice(0, 300) : ''
  if (!address) throw new JoblowskiError('Give an address to start from')
  const place = await geocode(address)
  if (!place) throw new JoblowskiError('OpenStreetMap does not know that address. Try the street and number, then the city')
  const home = { address, lat: place.lat, lon: place.lon }
  await db.insert(joblowskiMapHome).values({ ownerUid: uid, ...home })
    .onConflictDoUpdate({ target: joblowskiMapHome.ownerUid, set: { address: home.address, lat: home.lat, lon: home.lon } })
  return home
}

const ids = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new JoblowskiError('stopIds must be a list of job ids')
  if (v.length === 0) throw new JoblowskiError('Pick at least one job for the walk')
  if (v.length > 50) throw new JoblowskiError('Keep a walk under 50 stops')
  return [...new Set(v as string[])]
}

/**
 * The walk from home through the chosen jobs and back. With `optimize`, the
 * stops are put in a short loop first; otherwise they are walked as given.
 */
export async function planWalk(uid: string, input: { stopIds?: unknown; optimize?: unknown }): Promise<PlannedWalk> {
  const home = await getHome(uid)
  if (!home) throw new JoblowskiError('Set where your walks start first')
  const wanted = ids(input.stopIds)
  const rows = await db
    .select({ id: joblowskiApplications.id, lat: joblowskiApplications.lat, lon: joblowskiApplications.lon })
    .from(joblowskiApplications)
    .where(and(eq(joblowskiApplications.ownerUid, uid), inArray(joblowskiApplications.id, wanted), isNotNull(joblowskiApplications.lat)))
  const byId = new Map(rows.map((r) => [r.id, { id: r.id, lat: r.lat!, lon: r.lon! }]))
  const given = wanted.map((id) => byId.get(id)).filter((s): s is { id: string; lat: number; lon: number } => Boolean(s))
  if (given.length === 0) throw new JoblowskiError('None of those jobs has an address on the map yet')
  const stops = input.optimize === false ? given : shortLoop(home, given)
  const route = await walkingRoute([home, ...stops, home])
  return { stopIds: stops.map((s) => s.id), route }
}

export async function listWalks(uid: string): Promise<Walk[]> {
  const rows = await db.select().from(joblowskiWalks).where(eq(joblowskiWalks.ownerUid, uid)).orderBy(desc(joblowskiWalks.updatedAt))
  return rows.map((w) => ({ id: w.id, name: w.name, stopIds: w.stopIds, route: (w.route ?? null) as WalkRoute | null, updatedAt: w.updatedAt.toISOString() }))
}

const walkName = (v: unknown) => {
  const name = typeof v === 'string' ? v.trim() : ''
  if (!name) throw new JoblowskiError('Name the walk')
  return name.slice(0, 120)
}

export async function saveWalk(uid: string, input: { name?: unknown; stopIds?: unknown; route?: unknown }) {
  const [row] = await db
    .insert(joblowskiWalks)
    .values({ ownerUid: uid, name: walkName(input.name), stopIds: ids(input.stopIds), route: (input.route ?? null) as object | null })
    .returning({ id: joblowskiWalks.id })
  return { id: row.id }
}

export async function updateWalk(uid: string, id: string, input: { name?: unknown; stopIds?: unknown; route?: unknown }) {
  const set: Partial<typeof joblowskiWalks.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) set.name = walkName(input.name)
  if (input.stopIds !== undefined) set.stopIds = ids(input.stopIds)
  if (input.route !== undefined) set.route = (input.route ?? null) as object | null
  const rows = await db.update(joblowskiWalks).set(set).where(and(eq(joblowskiWalks.id, id), eq(joblowskiWalks.ownerUid, uid))).returning({ id: joblowskiWalks.id })
  if (!rows.length) throw new JoblowskiError('Not found', 404)
  return { ok: true }
}

export async function deleteWalk(uid: string, id: string) {
  const rows = await db.delete(joblowskiWalks).where(and(eq(joblowskiWalks.id, id), eq(joblowskiWalks.ownerUid, uid))).returning({ id: joblowskiWalks.id })
  if (!rows.length) throw new JoblowskiError('Not found', 404)
  return { ok: true }
}
