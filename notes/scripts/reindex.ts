/**
 * Rebuilds the notes index from the records, for every owner or one.
 *
 *   DATABASE_URL=… npx tsx scripts/reindex.ts [--did did:plc:…]
 *
 * Run after a migration adds an index column. Records are not changed.
 */
import { parseArgs } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { setNotesHost, type NotesDb } from '../src/host'
import { reindexAll } from '../src/lib/store'

const { values } = parseArgs({ options: { did: { type: 'string' } } })
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
setNotesHost({ db: drizzle(pool) as unknown as NotesDb, userId: async () => values.did ?? null })
const t0 = performance.now()
try {
  const n = await reindexAll(values.did)
  console.log(`reindexed ${n} notes in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
} finally {
  await pool.end()
}
