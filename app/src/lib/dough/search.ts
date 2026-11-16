/**
 * Dough's own things, for its search: the notes on tallied amounts, the
 * fronts' links and their documents. Steps and fronts themselves are
 * headings in dough.org, which the notes search covers.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export type DoughExtraHit = {
  frontId: string
  frontTitle: string
  kind: 'amount' | 'link' | 'document'
  title: string
  snippet: string | null
}

export async function searchDoughExtras(uid: string, did: string, q: string, limit = 30): Promise<DoughExtraHit[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)
  if (!words.length) return []
  // Every word somewhere in the row's text, as a part-word.
  const all = (text: ReturnType<typeof sql>) => sql.join(words.map((w) => sql`${text} ilike ${'%' + w.replace(/[\\%_]/g, '\\$&') + '%'}`), sql` and `)
  const rows = await db.execute<{ front_id: string; kind: DoughExtraHit['kind']; title: string; snippet: string | null }>(sql`
    select * from (
      select front_id, 'amount' as kind, coalesce(nullif(note, ''), 'Amount') as title,
             on_date::text || ' · ' || to_char(amount_cents / 100.0, 'FM999999990.00') || ' ' || currency as snippet
        from dough.tallies where owner_uid = ${uid} and ${all(sql`(coalesce(note, '') || ' ' || currency)`)}
      union all
      select front_id, 'link', label, url from dough.front_links
        where owner_uid = ${uid} and ${all(sql`(label || ' ' || url)`)}
      union all
      select front_id, 'document', filename, nullif(note, '') from dough.front_documents
        where owner_uid = ${uid} and ${all(sql`(filename || ' ' || coalesce(note, ''))`)}
    ) hits limit ${limit}
  `)
  if (!rows.rows.length) return []
  const ids = [...new Set(rows.rows.map((r) => r.front_id))]
  const titles = await db.execute<{ id: string; title: string }>(sql`
    select properties->>'CHAIN_ID' as id, title from notes.headings
     where did = ${did} and properties->>'CHAIN_ID' in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)
  const byId = new Map(titles.rows.map((t) => [t.id, t.title]))
  return rows.rows
    .filter((r) => byId.has(r.front_id))
    .map((r) => ({ frontId: r.front_id, frontTitle: byId.get(r.front_id)!, kind: r.kind, title: r.title, snippet: r.snippet }))
}
