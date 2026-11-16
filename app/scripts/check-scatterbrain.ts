/**
 * Check of Scatterbrain editing a note from the notes store, against a throwaway
 * user and identity that are removed afterwards.
 *
 *   cd app && set -a && . ./.env.local && set +a && npx tsx scripts/check-scatterbrain.ts
 */
import assert from 'node:assert/strict'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import { createNote, noteAt, orgText, setNotesHost, type NotesDb } from 'notes/server'
import { readOrgFile, restoreOrgFile, saveOrgFile, searchOrgFiles } from '../src/lib/scatterbrain/orgFiles'
async function main() {
  const did = 'did:plc:jankinotestest00000000sb0', uid = 'sbtest-' + Math.random().toString(36).slice(2, 8)
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool) as unknown as NotesDb
  setNotesHost({ db, userId: async () => did })
  await db.execute(sql`insert into auth.users (id, name) values (${uid}, 'sb test')`)
  await db.execute(sql`insert into auth.accounts (user_id, type, provider, provider_account_id) values (${uid}, 'credentials', 'bluesky', ${did})`)
  try {
    await createNote(did, 'writing/chapter_one.org', ':PROPERTIES:\n:ID: 11111111-2222-3333-4444-555555555555\n:END:\n#+title: Chapter One\nIt was a *dark* night.\n* Scene\nRain on the roof.\n')
    const f = await readOrgFile(uid, 'writing/chapter_one.org')
    assert.equal(f.title, 'Chapter One'); assert.equal(f.nodeId, '11111111-2222-3333-4444-555555555555')
    assert.match(f.markdown, /It was a \*\*dark\*\* night\./)
    assert.equal(((await saveOrgFile(uid, 'writing/chapter_one.org', f.markdown, f.sha, false)) as { changed: boolean }).changed, false, 'unchanged markdown writes nothing')
    const refused = await saveOrgFile(uid, 'writing/chapter_one.org', 'x', 'not-the-sha', false)
    assert.equal((refused as { conflict: string }).conflict, 'changed')
    const saved = await saveOrgFile(uid, 'writing/chapter_one.org', f.markdown.replace('dark', 'stormy'), f.sha, false) as { sha: string; changed: boolean; previous: string }
    assert.equal(saved.changed, true)
    const now = orgText((await noteAt(did, 'writing/chapter_one.org'))!.note)
    assert.match(now, /It was a \*stormy\* night\./); assert.match(now, /:ID: 11111111/, 'the ID drawer survives')
    assert.equal((await readOrgFile(uid, 'writing/chapter_one.org')).sha, saved.sha, 'the sha it returns is the note as stored')
    await restoreOrgFile(uid, 'writing/chapter_one.org', saved.previous)
    assert.match(orgText((await noteAt(did, 'writing/chapter_one.org'))!.note), /\*dark\*/)
    assert.equal((await searchOrgFiles(uid, 'chapter'))[0].path, 'writing/chapter_one.org')
    assert.equal((await searchOrgFiles(uid, 'roof'))[0].path, 'writing/chapter_one.org')
    await assert.rejects(readOrgFile(uid, '../etc/passwd'), /not a note/)
    console.log('all Scatterbrain note checks passed')
  } finally {
    await db.execute(sql`delete from notes.records where did = ${did}`)
    await db.execute(sql`delete from auth.accounts where user_id = ${uid}`)
    await db.execute(sql`delete from auth.users where id = ${uid}`)
    await pool.end()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
