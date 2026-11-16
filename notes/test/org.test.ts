import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexRows, plainText } from '../src/lib/index'
import { orgText, parseOrg, parseTimestamp } from '../src/lib/org'
import { repeats } from '../src/lib/dates'
import { tidAt, tidTime, TID } from '../src/lib/tid'
import { NOTE, type NoteRecord } from '../src/lib/types'

const garlic = '* TODO [#A] Plant garlic'
const FILE = [
  ':PROPERTIES:',
  ':ID: aaaaaaaa-0000-0000-0000-000000000001',
  ':END:',
  '#+title: Garden',
  '#+filetags: :home:',
  'Intro text with [[id:aaaaaaaa-0000-0000-0000-000000000009][a link]].',
  // Tags right-aligned to column 77, as org writes them.
  garlic + ' '.repeat(77 - garlic.length - ':outside:'.length) + ':outside:',
  'SCHEDULED: <2026-11-15 Sun ++1w>',
  ':PROPERTIES:',
  ':ID: aaaaaaaa-0000-0000-0000-000000000002',
  ':END:',
  'Before the frost.',
  '** DONE Buy bulbs',
  'CLOSED: [2026-11-10 Tue 14:02]',
  'See [[id:aaaaaaaa-0000-0000-0000-000000000001]].',
  '*bold* is not a heading',
  '',
].join('\n')

test('parses structure out of an org file', () => {
  const p = parseOrg(FILE)
  assert.equal(p.title, 'Garden')
  assert.deepEqual(p.tags, ['home'])
  assert.equal(p.properties?.[0].value, 'aaaaaaaa-0000-0000-0000-000000000001')
  assert.equal(p.headings.length, 2)
  const [garlic, bulbs] = p.headings
  assert.equal(garlic.todo, 'TODO')
  assert.equal(garlic.priority, 'A')
  assert.equal(garlic.title, 'Plant garlic')
  assert.deepEqual(garlic.tags, ['outside'])
  assert.deepEqual(garlic.scheduled, { active: true, date: '2026-11-15', day: 'Sun', repeat: '++1w' })
  assert.equal(garlic.body, 'Before the frost.')
  assert.equal(bulbs.closed?.time, '14:02')
  assert.equal(bulbs.body, 'See [[id:aaaaaaaa-0000-0000-0000-000000000001]].\n*bold* is not a heading\n')
})

test('writes a canonically laid-out file back byte for byte', () => {
  assert.equal(orgText(parseOrg(FILE)), FILE)
})

test('normalises CRLF and aligned property values', () => {
  assert.equal(parseOrg(':PROPERTIES:\n:ID:       z\n:END:\n').properties?.[0].value, 'z')
  const crlf = '* Heading\r\n:PROPERTIES:\r\n:ID:    x1\r\n:END:\r\nBody\r\n'
  const p = parseOrg(crlf)
  assert.equal(p.headings[0].properties?.[0].value, 'x1')
  assert.equal(orgText(p), '* Heading\n:PROPERTIES:\n:ID: x1\n:END:\nBody\n')
})

test('keeps what it does not understand in the body', () => {
  const odd = '* Meeting\nSCHEDULED: <2026-11-15 Sun>--<2026-11-16 Mon>\n:PROPERTIES:\n:ID: y\n'
  const p = parseOrg(odd)
  assert.equal(p.headings[0].scheduled, undefined)
  assert.equal(p.headings[0].properties, undefined)
  assert.equal(orgText(p), odd)
})

test('timestamps', () => {
  assert.deepEqual(parseTimestamp('<2026-11-15 Sun 09:00-10:30 .+2d/4d -1d>'), {
    active: true, date: '2026-11-15', day: 'Sun', time: '09:00', endTime: '10:30', repeat: '.+2d/4d', warning: '-1d',
  })
  assert.equal(parseTimestamp('[2026-11-15 søn]')?.day, 'søn')
  assert.equal(parseTimestamp('<2026-11-15 Sun]'), null)
})

test('indexes headings, inherited tags and links like org-roam', () => {
  const p = parseOrg(FILE)
  const note: NoteRecord = { $type: NOTE, title: p.title!, tags: p.tags, properties: p.properties, body: p.body, headings: p.headings, createdAt: '2026-11-15T00:00:00Z' }
  const { headings, links } = indexRows(note)
  assert.equal(headings.length, 3)
  assert.deepEqual(headings[2].allTags, ['home', 'outside'])
  assert.deepEqual(headings[2].olp, ['Garden', 'Plant garlic'])
  assert.equal(headings[2].done, true)
  // The link under "Buy bulbs" (no ID) belongs to its nearest ancestor with one.
  assert.deepEqual(links.map((l) => [l.idx, l.sourceOrgId, l.targetOrgId]), [
    [0, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009'],
    [2, 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'],
  ])
})

test('repeaters', () => {
  assert.deepEqual(repeats('2026-11-15', '++1w', '2026-11-30'), ['2026-11-15', '2026-11-22', '2026-11-29'])
  // Like org: 31 January plus a month is "31 February", which rolls over to 3 March.
  assert.deepEqual(repeats('2026-01-31', '+1m', '2026-03-31'), ['2026-01-31', '2026-03-03'])
  assert.deepEqual(repeats('2026-11-15', null, '2027-01-01'), ['2026-11-15'])
})

test('TIDs sort by time and decode', () => {
  const a = tidAt(BigInt("1700000000000000"), 1)
  const b = tidAt(BigInt("1700000000000001"), 0)
  assert.match(a, TID)
  assert.ok(a < b)
  assert.equal(tidTime(a), 1_700_000_000_000)
})

test('plain text for search drops link markup', () => {
  assert.equal(plainText('see [[id:abc][balsam fir]] and [[https://x.org]] or [[id:def]]'), 'see balsam fir and https://x.org or def')
})

test('repeaters move on when done, the way org moves them', async () => {
  const { nextRepeat } = await import('../src/lib/tasks')
  const ts = (repeat: string) => ({ active: true, date: '2026-11-01', day: 'Sun', repeat })
  // +1w: one step from the old date, even if that is still in the past.
  assert.equal(nextRepeat(ts('+1w'), '2026-11-15').date, '2026-11-08')
  // ++1w: steps until it is after today.
  assert.equal(nextRepeat(ts('++1w'), '2026-11-15').date, '2026-11-22')
  // .+1w: one step from today.
  assert.equal(nextRepeat(ts('.+1w'), '2026-11-15').date, '2026-11-22')
  assert.equal(nextRepeat(ts('++1w'), '2026-11-15').day, 'Sun')
  assert.equal(nextRepeat(ts('.+1d'), '2026-11-15').day, 'Mon')
  assert.equal(nextRepeat(ts('+1m'), '2026-11-15').date, '2026-12-01')
})

test('attachments survive the trip through org text', async () => {
  const { blobCid } = await import('../src/lib/cid')
  const cid = blobCid(new TextEncoder().encode('hello'))
  // The CID of "hello" as ATProto (and IPFS, raw codec) computes it.
  assert.equal(cid, 'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq')
  const text = `* TODO Pay rent\n:PROPERTIES:\n:CHAIN_ID: x\n:ATTACHMENT: ${cid} 5 text/plain 2026-11-15T10:00:00.000Z lease scan.pdf\n:END:\nBody\n`
  const p = parseOrg(text)
  assert.deepEqual(p.headings[0].properties, [{ key: 'CHAIN_ID', value: 'x' }])
  assert.deepEqual(p.headings[0].attachments, [{ name: 'lease scan.pdf', addedAt: '2026-11-15T10:00:00.000Z', blob: { $type: 'blob', ref: { $link: cid }, mimeType: 'text/plain', size: 5 } }])
  assert.equal(orgText(p), text)
})

test('SOMEDAY is a TODO keyword', () => {
  assert.equal(parseOrg('* SOMEDAY Learn the cello\n').headings[0].todo, 'SOMEDAY')
})
