/**
 * Brings a folder of .org files into notes for one owner, through the mirror.
 *
 *   DATABASE_URL=… npx tsx scripts/import-org.ts --dir ~/org --did did:plc:… [--dry-run]
 *
 * Safe to run again. A changed file replaces its note under the same rkey, so
 * its at:// address stays put. A deleted file takes its note with it. A note
 * edited in janki since the last sync is left alone and listed as a conflict.
 * Files are only read, never changed.
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { setNotesHost, type NotesDb } from '../src/host'
import { syncOrgDir } from '../src/mirror'

const { values } = parseArgs({
  options: { dir: { type: 'string' }, did: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
})
if (!values.dir || !values.did) throw new Error('usage: import-org.ts --dir <org folder> --did <did:plc:…> [--dry-run]')
if (!/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(values.did)) throw new Error(`Not a DID: ${values.did}`)
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL')
const did = values.did
const root = path.resolve(values.dir.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
setNotesHost({ db: drizzle(pool) as unknown as NotesDb, userId: async () => did })
try {
  const r = await syncOrgDir(did, root, { dryRun: values['dry-run'] })
  console.log(`${values['dry-run'] ? '[dry run] ' : ''}${r.imported.length} imported, ${r.unchanged} unchanged, ${r.deleted.length} deleted, ${r.conflicts.length} conflicts in ${(r.ms / 1000).toFixed(1)}s`)
  for (const c of r.conflicts) console.log(`  conflict (edited in janki, file not imported): ${c}`)
} finally {
  await pool.end()
}
