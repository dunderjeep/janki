/** Your bank and money sites, along the top of Dough. */
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { ChainError } from '@/lib/chains/store'

export type MoneyLink = { id: string; label: string; url: string }

const label = (v: unknown) => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) throw new ChainError('Give the link a name')
  if (t.length > 40) throw new ChainError('Keep the name under 40 characters')
  return t
}

/** https only: these are bank logins, and a plain http link to one is a mistake worth refusing. */
const url = (v: unknown) => {
  const raw = typeof v === 'string' ? v.trim() : ''
  let parsed: URL
  try {
    parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new ChainError('That is not a web address')
  }
  if (parsed.protocol !== 'https:') throw new ChainError('Use an https:// address')
  return parsed.toString()
}

export async function listLinks(uid: string): Promise<MoneyLink[]> {
  const { rows } = await db.execute<MoneyLink>(sql`
    select id, label, url from dough.links where owner_uid = ${uid} order by position, created_at`)
  return rows
}

export async function addLink(uid: string, input: Record<string, unknown>): Promise<MoneyLink> {
  const link = { id: nanoid(), label: label(input.label), url: url(input.url) }
  await db.execute(sql`
    insert into dough.links (id, owner_uid, label, url, position)
    values (${link.id}, ${uid}, ${link.label}, ${link.url},
            (select coalesce(max(position), -1) + 1 from dough.links where owner_uid = ${uid}))`)
  return link
}

export async function updateLink(uid: string, id: string, input: Record<string, unknown>): Promise<MoneyLink> {
  const { rows } = await db.execute<MoneyLink>(sql`
    update dough.links set label = ${label(input.label)}, url = ${url(input.url)}
     where id = ${id} and owner_uid = ${uid}
     returning id, label, url`)
  if (!rows[0]) throw new ChainError('Not found', 404)
  return rows[0]
}

export async function deleteLink(uid: string, id: string) {
  const { rowCount } = await db.execute(sql`delete from dough.links where id = ${id} and owner_uid = ${uid}`)
  if (!rowCount) throw new ChainError('Not found', 404)
  return { ok: true }
}

/** Moves a link one place left or right. */
export async function nudgeLink(uid: string, id: string, by: -1 | 1) {
  const links = await listLinks(uid)
  const i = links.findIndex((l) => l.id === id)
  if (i < 0) throw new ChainError('Not found', 404)
  const j = i + by
  if (j < 0 || j >= links.length) return { ok: true }
  ;[links[i], links[j]] = [links[j], links[i]]
  await db.transaction(async (tx) => {
    for (let k = 0; k < links.length; k++) {
      await tx.execute(sql`update dough.links set position = ${k} where id = ${links[k].id} and owner_uid = ${uid}`)
    }
  })
  return { ok: true }
}
