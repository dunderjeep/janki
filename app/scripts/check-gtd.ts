/**
 * End-to-end check of Next's GTD layer, against a throwaway identity that is
 * wiped before and after: capture, every processing decision, snooze, someday,
 * waiting-for, the weekly review, and attachments through the real blob store.
 *
 *   cd app && set -a && . ./.env.local && set +a && npx tsx scripts/check-gtd.ts
 *
 * Touches no one's real notes. Needs Postgres and MinIO up.
 */
import assert from 'node:assert/strict'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import { createNote, noteAt, orgText, setNotesHost, type NotesDb } from 'notes/server'
import { minioBlobs } from '../src/lib/notesBlobs'
import { attach, capture, detach, inboxView, markReviewed, processItem, readBlob, review, snooze, somedayList } from '../src/lib/chains/gtd'
import { deleteHeading, purgeHeading, readChains, restoreHeading, setField, trashList } from '../src/lib/chains/notesChains'
import { actionsFor, buildTree, upcomingIn } from '../src/lib/chains/tree'

const LIFE = { key: 'life', title: 'Life', href: '/next' }

async function main() {
  const did = 'did:plc:jankinotestest0000000003'
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool) as unknown as NotesDb
  setNotesHost({ db, userId: async () => did, blobs: minioBlobs })
  const today = '2026-11-15'
  const wipe = () => db.execute(sql`DELETE FROM notes.records WHERE did = ${did}`)
  const lifeNow = async (day: string) => actionsFor(LIFE, buildTree(await readChains(did, 'tasks.org')), day)
  try {
    await wipe()
    await createNote(did, 'tasks.org', '#+title: tasks\n* Garden\n:PROPERTIES:\n:ORDERED: t\n:END:\n** TODO Buy bulbs\n** TODO Plant them\n')
    const ids: Record<string, string> = {}
    const things = ['Call mum', 'Fix the gate', 'Renovate the shed', 'Tax papers from accountant', 'Learn the cello',
      'Idea: a pattern language reading group', 'Junk mail', 'Renew passport']
    for (const t of things) ids[t] = await capture(did, t, t.startsWith('Idea') ? 'Meet monthly; start with Alexander.' : undefined)
    let inbox = await inboxView(did, today)
    assert.equal(inbox.items.length, 8)
    assert.match(inbox.items[0].created!, /^\[\d{4}-\d{2}-\d{2} \w{3} \d{2}:\d{2}\]$/)

    await processItem(did, ids['Call mum'], { kind: 'now' })
    await processItem(did, ids['Fix the gate'], { kind: 'next', place: 'life', contexts: '@home @tools', effort: '0:30', energy: 'high' })
    await processItem(did, ids['Renovate the shed'], { kind: 'project', place: 'life', firstStep: 'Measure the shed' })
    await processItem(did, ids['Tax papers from accountant'], { kind: 'waiting', place: 'life', who: 'Ola the accountant' })
    await processItem(did, ids['Learn the cello'], { kind: 'someday', place: 'life' })
    const kept = await processItem(did, ids['Idea: a pattern language reading group'], { kind: 'note' })
    await processItem(did, ids['Junk mail'], { kind: 'trash' })
    await processItem(did, ids['Renew passport'], { kind: 'snooze', until: '2026-11-28' })
    await assert.rejects(processItem(did, ids['Junk mail'], { kind: 'trash' }), /no longer there/)

    inbox = await inboxView(did, today)
    assert.equal(inbox.items.length, 0, 'inbox zero')
    assert.deepEqual(inbox.snoozed.map((i) => [i.title, i.until]), [['Renew passport', '2026-11-28']])
    assert.equal((await inboxView(did, '2026-11-28')).items[0].title, 'Renew passport', 'back on its day')
    assert.equal(kept.note, 'idea_a_pattern_language_reading_group.org')
    const made = (await noteAt(did, kept.note!))!.note
    assert.equal(made.title, 'Idea: a pattern language reading group')
    assert.equal(made.body, 'Meet monthly; start with Alexander.')
    assert.ok(made.properties?.some((p) => p.key === 'ID'), 'the kept note is linkable')

    let acts = await lifeNow(today)
    const titles = acts.map((a) => a.title).sort()
    assert.deepEqual(titles, ['Buy bulbs', 'Call mum', 'Fix the gate', 'Measure the shed', 'Tax papers from accountant'])
    const gate = acts.find((a) => a.title === 'Fix the gate')!
    assert.deepEqual(gate.contexts, ['@home', '@tools']); assert.equal(gate.effort, '0:30'); assert.equal(gate.energy, 'high')
    assert.equal(acts.find((a) => a.title === 'Call mum')!.now, true)
    const tax = acts.find((a) => a.title === 'Tax papers from accountant')!
    assert.equal(tax.waiting, true); assert.equal(tax.waitingOn, 'Ola the accountant')

    // Snoozing the first step of an ordered project holds the whole project, until its day.
    const bulbs = acts.find((a) => a.title === 'Buy bulbs')!
    await snooze(did, 'life', bulbs.id!, '2026-11-20')
    acts = await lifeNow(today)
    assert.ok(!acts.some((a) => a.title === 'Buy bulbs' || a.title === 'Plant them'), 'a snoozed step holds its chain')
    assert.ok((await lifeNow('2026-11-20')).some((a) => a.title === 'Buy bulbs'), 'and it is back on its day')
    await snooze(did, 'life', bulbs.id!, null)

    assert.deepEqual((await somedayList(did)).map((t) => t.title), ['Learn the cello'])
    await setField(did, 'tasks.org', gate.id!, 'todo', 'DONE')
    const r = await review(did, today)
    assert.equal(r.inbox, 0)
    assert.deepEqual(r.waiting.map((t) => [t.title, t.who]), [['Tax papers from accountant', 'Ola the accountant']])
    assert.deepEqual(r.comingBack.map((t) => [t.title, t.date]), [['Renew passport', '2026-11-28']])
    assert.ok(r.done.some((t) => t.title === 'Fix the gate'))
    await markReviewed(did, today)
    assert.equal((await review(did, today)).lastReview, today)

    // Attachments: stored by content, readable only by their owner, and written into the org text.
    const bytes = new TextEncoder().encode('Receipt: 3 tulip bulbs, 45 kr')
    const a = await attach(did, 'life', bulbs.id!, 'receipt.txt', bytes, 'text/plain')
    assert.match(a.cid, /^bafkrei/)
    const back = await readBlob(did, a.cid)
    assert.equal(new TextDecoder().decode(back!.bytes), 'Receipt: 3 tulip bulbs, 45 kr')
    assert.equal(back!.mimeType, 'text/plain')
    assert.equal(await readBlob('did:plc:someoneelse00000000000000', a.cid), null, 'another owner cannot read it')
    assert.deepEqual((await readChains(did, 'tasks.org')).find((h) => h.id === bulbs.id)!.attachments.map((x) => x.name), ['receipt.txt'])
    assert.ok(orgText((await noteAt(did, 'tasks.org'))!.note).includes(`:ATTACHMENT: ${a.cid} 29 text/plain`))
    await detach(did, 'life', bulbs.id!, a.cid)
    assert.equal((await readChains(did, 'tasks.org')).find((h) => h.id === bulbs.id)!.attachments.length, 0)
    await minioBlobs.delete!(did, a.cid)
    // Dated tasks: a bill with a 3-day warning is "coming up" until its warning starts, then can be done.
    await createNote(did, 'bills.org', '')
    await db.execute(sql`DELETE FROM notes.records WHERE did = ${did} AND value->>'path' = 'bills.org'`)
    const { addHeading } = await import('../src/lib/chains/notesChains')
    const rent = await addHeading(did, 'tasks.org', null, 'last', 'Pay rent', 'TODO')
    const { updateNoteAt, getProperty } = await import('notes/server')
    await updateNoteAt(did, 'tasks.org', (note) => {
      const h = note.headings.find((x) => getProperty(x, 'CHAIN_ID') === rent)!
      h.deadline = { active: true, date: '2026-11-24', day: 'Tue', repeat: '+1m', warning: '-3d' }
    })
    const fronts = async () => buildTree(await readChains(did, 'tasks.org'))
    assert.ok(!(await lifeNow('2026-11-20')).some((a) => a.title === 'Pay rent'), 'not before its warning')
    const up = upcomingIn(LIFE, await fronts(), '2026-11-20').find((u) => u.title === 'Pay rent')!
    assert.deepEqual([up.date, up.kind], ['2026-11-24', 'deadline'])
    assert.ok((await lifeNow('2026-11-21')).some((a) => a.title === 'Pay rent'), 'from its warning day')
    assert.ok((await lifeNow('2026-11-30')).some((a) => a.title === 'Pay rent'), 'and when overdue')
    // Scheduling it for a day and time puts it on that day, and only then can it be done.
    await snooze(did, 'life', rent, '2026-11-26 09:30')
    assert.ok(!(await lifeNow('2026-11-25')).some((a) => a.title === 'Pay rent'))
    const timed = upcomingIn(LIFE, await fronts(), '2026-11-25').find((u) => u.title === 'Pay rent')!
    assert.deepEqual([timed.date, timed.time, timed.kind, timed.deadline], ['2026-11-26', '09:30', 'scheduled', '2026-11-24'])
    assert.ok((await lifeNow('2026-11-26')).some((a) => a.title === 'Pay rent'))
    await assert.rejects(snooze(did, 'life', rent, '26/11/2026'), /needs a day/)

    // Delete goes to the Trash, and restore puts it back under its old parent.
    const shed = (await readChains(did, 'tasks.org')).find((h) => h.title === 'Measure the shed')!
    const shedParent = (await readChains(did, 'tasks.org')).find((h) => h.title === 'Renovate the shed')!
    await deleteHeading(did, 'tasks.org', shed.id)
    assert.ok(!(await readChains(did, 'tasks.org')).some((h) => h.id === shed.id))
    const fromTasks = async () => (await trashList(did)).filter((t) => t.from === 'tasks.org')
    // The inbox's trashed "Junk mail" is in there too, from inbox.org.
    assert.ok((await trashList(did)).some((t) => t.title === 'Junk mail' && t.from === 'inbox.org'), 'inbox trash is recoverable')
    assert.deepEqual((await fromTasks()).map((t) => [t.title, t.from]), [['Measure the shed', 'tasks.org']])
    assert.equal(await restoreHeading(did, shed.id), 'tasks.org')
    const after = await readChains(did, 'tasks.org')
    const i = after.findIndex((h) => h.id === shed.id)
    assert.ok(i > 0 && after[i - 1].id === shedParent.id && after[i].level === shedParent.level + 1, 'back under its project')
    assert.equal((await fromTasks()).length, 0)
    await deleteHeading(did, 'tasks.org', shed.id)
    await purgeHeading(did, shed.id)
    assert.equal((await fromTasks()).length, 0)
    assert.ok(!(await readChains(did, 'tasks.org')).some((h) => h.id === shed.id), 'gone for good')
    console.log('all GTD checks passed')
  } finally {
    await wipe()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
