// Import a multi-deck JSON bundle into janki (srs_decks + srs_cards + srs_card_states).
// Usage: NODE_PATH=app/node_modules node scripts/import-decks.mjs <bundle.json> <ownerUid>
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// nanoid's default 21-char alphabet, reimplemented so this script needs only `pg`
const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
const nanoid = () =>
  Array.from(randomBytes(21), (b) => ALPHABET[b & 63]).join('')

const [, , bundlePath, ownerUid] = process.argv
if (!bundlePath || !ownerUid) {
  console.error('usage: import-decks.mjs <bundle.json> <ownerUid>')
  process.exit(1)
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
const url = readFileSync('app/.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='))
  .slice('DATABASE_URL='.length)
  .trim()

const newState = () => ({
  state: 'new',
  stability: 0,
  difficulty: 1.75, // ALGO_DEFAULTS.initEF
  reps: 0,
  lapses: 0,
  dueAt: new Date().toISOString(),
  lastReviewedAt: null,
})

const client = new Client({ connectionString: url })
await client.connect()
await client.query('BEGIN')
try {
  for (const deck of bundle.decks) {
    const deckId = nanoid()
    await client.query(
      `INSERT INTO janki.srs_decks (id, owner_uid, name, description) VALUES ($1,$2,$3,$4)`,
      [deckId, ownerUid, deck.deckName, deck.description ?? ''],
    )
    for (const card of deck.cards) {
      const cardId = nanoid()
      await client.query(
        `INSERT INTO janki.srs_cards
           (id, owner_uid, deck_id, front, back, tags, front_diagram, back_diagram)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          cardId, ownerUid, deckId, card.front, card.back, deck.tags ?? [],
          card.frontDiagram ?? null, card.backDiagram ?? null,
        ],
      )
      await client.query(
        `INSERT INTO janki.srs_card_states (id, owner_uid, deck_id, srs) VALUES ($1,$2,$3,$4)`,
        [cardId, ownerUid, deckId, JSON.stringify(newState())],
      )
    }
    console.log(`${deck.deckName}: ${deck.cards.length} cards`)
  }
  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  await client.end()
}
