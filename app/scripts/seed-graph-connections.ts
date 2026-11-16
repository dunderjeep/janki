/**
 * seed-graph-connections.ts
 *
 * Seeds RELATED_TO edges in the graph for the predict project decks:
 *
 *   • Norway forestry decks (1–9): chained in study order
 *   • P vs NP complexity decks (pnp1–pnp29): chained as a curriculum sequence
 *   • Cross-domain bridges: pnp29 → Norway decks (forestry optimization)
 *
 * Ensures every deck has a graph node (runs the same lazy-sync logic as
 * the API route), then creates edges with labels.
 *
 * Usage:
 *   npx tsx scripts/seed-graph-connections.ts your@email.com
 *
 * Skips edges that already exist (idempotent by checking fromNodeId+toNodeId).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and, ilike, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as schema from '../src/db/schema/janki'
import * as authSchema from '../src/db/schema/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db   = drizzle(pool, { schema: { ...schema, ...authSchema } })

const email = process.argv[2]
if (!email) { console.error('Usage: npx tsx scripts/seed-graph-connections.ts your@email.com'); process.exit(1) }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUid(email: string): Promise<string> {
  const [user] = await db
    .select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers)
    .where(eq(authSchema.authUsers.email, email))
    .limit(1)
  if (!user) throw new Error(`User not found: ${email}`)
  return user.id
}

/** Ensure a deck has a graphNode, create one if missing. Returns nodeId. */
async function ensureDeckNode(uid: string, deckId: string, deckName: string): Promise<string> {
  const [deck] = await db
    .select({ nodeId: schema.srsDecks.nodeId })
    .from(schema.srsDecks)
    .where(and(eq(schema.srsDecks.id, deckId), eq(schema.srsDecks.ownerUid, uid)))
    .limit(1)

  if (deck?.nodeId) return deck.nodeId

  // Create graph node
  const nodeId = nanoid()
  await db.insert(schema.graphNodes).values({
    id:       nodeId,
    graphId:  'default',
    ownerUid: uid,
    label:    deckName,
    props:    { kind: 'Deck', srsId: deckId },
    ui:       {},
  })
  await db
    .update(schema.srsDecks)
    .set({ nodeId, updatedAt: new Date() })
    .where(and(eq(schema.srsDecks.id, deckId), eq(schema.srsDecks.ownerUid, uid)))

  return nodeId
}

/** Create a RELATED_TO edge if one doesn't already exist between these nodes. */
async function ensureEdge(
  uid: string,
  fromNodeId: string,
  toNodeId: string,
  label: string,
): Promise<boolean> {
  // Check for existing edge in either direction
  const existing = await db
    .select({ id: schema.graphEdges.id })
    .from(schema.graphEdges)
    .where(
      and(
        eq(schema.graphEdges.ownerUid, uid),
        eq(schema.graphEdges.type, 'RELATED_TO'),
        eq(schema.graphEdges.fromNodeId, fromNodeId),
        eq(schema.graphEdges.toNodeId, toNodeId),
      ),
    )
    .limit(1)

  if (existing.length) return false // already exists

  await db.insert(schema.graphEdges).values({
    id:         nanoid(),
    graphId:    'default',
    ownerUid:   uid,
    type:       'RELATED_TO',
    fromNodeId,
    toNodeId,
    props:      { label },
  })
  return true
}

// ── Deck name patterns ────────────────────────────────────────────────────────

// Norway decks: named "1. 🌲 …" through "9. 📖 …"
const NORWAY_ORDER = [
  '1. 🌲',
  '2. 📊',
  '3. 🔭',
  '4. 🛰️',
  '5. 🛩️',
  '6. 📡',
  '7. 🛸',
  '8. 🤖',
  '9. 📖',
]

// PNP decks: named "pnp1. …" through "pnp29. …"
function pnpPrefix(n: number) { return `pnp${n}.` }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const uid = await getUid(email)
  console.log(`User: ${email} (${uid})`)

  // ── Fetch all user decks ───────────────────────────────────────────────────
  const allDecks = await db
    .select({ id: schema.srsDecks.id, name: schema.srsDecks.name, nodeId: schema.srsDecks.nodeId })
    .from(schema.srsDecks)
    .where(eq(schema.srsDecks.ownerUid, uid))

  const byName = Object.fromEntries(allDecks.map(d => [d.name, d]))

  // ── Find Norway decks in order ─────────────────────────────────────────────
  const norwayDecks = NORWAY_ORDER
    .map(prefix => allDecks.find(d => d.name.startsWith(prefix)))
    .filter(Boolean) as typeof allDecks

  console.log(`\nNorway decks found: ${norwayDecks.length}`)
  norwayDecks.forEach(d => console.log(`  ${d.name}`))

  // ── Find P vs NP decks in order ────────────────────────────────────────────
  const pnpDecks: typeof allDecks = []
  for (let i = 1; i <= 29; i++) {
    const d = allDecks.find(d => d.name.startsWith(pnpPrefix(i)))
    if (d) pnpDecks.push(d)
  }

  console.log(`\nP vs NP decks found: ${pnpDecks.length}`)
  pnpDecks.forEach(d => console.log(`  ${d.name}`))

  // ── Ensure all found decks have graph nodes ────────────────────────────────
  const allTarget = [...norwayDecks, ...pnpDecks]
  const nodeIds: Record<string, string> = {}

  console.log('\nSyncing graph nodes…')
  for (const deck of allTarget) {
    nodeIds[deck.id] = await ensureDeckNode(uid, deck.id, deck.name)
  }
  console.log(`  ${allTarget.length} deck nodes ready`)

  // ── Chain Norway decks ─────────────────────────────────────────────────────
  let edgesCreated = 0
  let edgesSkipped = 0

  console.log('\nChaining Norway decks…')
  for (let i = 0; i < norwayDecks.length - 1; i++) {
    const from = norwayDecks[i]
    const to   = norwayDecks[i + 1]
    const created = await ensureEdge(uid, nodeIds[from.id], nodeIds[to.id], 'study next')
    if (created) { edgesCreated++; console.log(`  + ${from.name.slice(0, 30)} → ${to.name.slice(0, 30)}`) }
    else         { edgesSkipped++; console.log(`  ~ already exists`) }
  }

  // ── Chain P vs NP decks ────────────────────────────────────────────────────
  console.log('\nChaining P vs NP decks…')
  for (let i = 0; i < pnpDecks.length - 1; i++) {
    const from = pnpDecks[i]
    const to   = pnpDecks[i + 1]
    const created = await ensureEdge(uid, nodeIds[from.id], nodeIds[to.id], 'builds on')
    if (created) { edgesCreated++; console.log(`  + ${from.name.slice(0, 30)} → ${to.name.slice(0, 30)}`) }
    else         { edgesSkipped++; console.log(`  ~ already exists`) }
  }

  // ── Cross-domain bridges ───────────────────────────────────────────────────
  // pnp29 (Connections to Predict & Forestry) → each Norway deck
  const pnp29 = pnpDecks.find(d => d.name.startsWith('pnp29.'))
  if (pnp29) {
    console.log('\nCross-domain bridges (pnp29 → Norway)…')
    for (const norway of norwayDecks) {
      const created = await ensureEdge(uid, nodeIds[pnp29.id], nodeIds[norway.id], 'connects to')
      if (created) { edgesCreated++; console.log(`  + ${pnp29.name.slice(0, 25)} → ${norway.name.slice(0, 25)}`) }
      else         { edgesSkipped++; console.log(`  ~ already exists`) }
    }
  }

  // pnp15 (NP-Complete) → Norway deck 2 (Statistical Methods) — algorithms ↔ stats
  const pnp15   = pnpDecks.find(d => d.name.startsWith('pnp15.'))
  const norway2 = norwayDecks.find(d => d.name.startsWith('2.'))
  if (pnp15 && norway2) {
    const created = await ensureEdge(uid, nodeIds[pnp15.id], nodeIds[norway2.id], 'approx algorithms ↔ stats')
    if (created) { edgesCreated++; console.log(`\n  + ${pnp15.name.slice(0, 25)} → ${norway2.name.slice(0, 25)}`) }
    else         { edgesSkipped++ }
  }

  // pnp8 (Complexity Classes) → Norway deck 4 (Remote Sensing) — computational complexity ↔ satellite data
  const pnp8    = pnpDecks.find(d => d.name.startsWith('pnp8.'))
  const norway4 = norwayDecks.find(d => d.name.startsWith('4.'))
  if (pnp8 && norway4) {
    const created = await ensureEdge(uid, nodeIds[pnp8.id], nodeIds[norway4.id], 'ML complexity ↔ remote sensing')
    if (created) { edgesCreated++; console.log(`  + ${pnp8.name.slice(0, 25)} → ${norway4.name.slice(0, 25)}`) }
    else         { edgesSkipped++ }
  }

  console.log(`\nDone. ${edgesCreated} edges created, ${edgesSkipped} already existed.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => pool.end())
