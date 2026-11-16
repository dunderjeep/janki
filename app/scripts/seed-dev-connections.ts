/**
 * seed-dev-connections.ts
 *
 * Seeds RELATED_TO graph edges for the 22 senior-dev interview prep decks.
 *
 * Edges:
 *   • Linear chain dev1 → dev2 → … → dev22  ("builds on")
 *   • Structural cross-deck connections (see CROSS_EDGES below)
 *
 * Idempotent — skips edges that already exist.
 *
 * Usage:
 *   npx tsx scripts/seed-dev-connections.ts your@email.com
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as schema from '../src/db/schema/janki'
import * as authSchema from '../src/db/schema/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db   = drizzle(pool, { schema: { ...schema, ...authSchema } })

const email = process.argv[2]
if (!email) { console.error('Usage: npx tsx scripts/seed-dev-connections.ts your@email.com'); process.exit(1) }

// ── Cross-deck structural edges ───────────────────────────────────────────────
// [fromPrefix, toPrefix, label]
const CROSS_EDGES: [string, string, string][] = [
  // JS runtime feeds React and Node.js
  ['dev2.', 'dev4.', 'React runs in JS engine'],
  ['dev2.', 'dev21.', 'Node.js is the JS runtime'],
  // TypeScript tightens both React and Node.js
  ['dev3.', 'dev4.',  'typed React components'],
  ['dev3.', 'dev21.', 'TypeScript on Node.js'],
  // React is the base of Next.js
  ['dev4.', 'dev5.',  'Next.js wraps React'],
  // CSS/Tailwind is the styling layer for React & Next.js
  ['dev22.', 'dev4.', 'styles React components'],
  ['dev22.', 'dev5.', 'styles Next.js pages'],
  // REST + Auth are tightly coupled
  ['dev6.', 'dev7.',  'auth lives over HTTP'],
  // PostgreSQL + Redis form the data layer
  ['dev8.', 'dev9.',  'Redis caches Postgres queries'],
  // GraphQL sits on top of REST patterns
  ['dev6.', 'dev10.', 'GraphQL over HTTP'],
  // GraphQL clients live in React
  ['dev10.', 'dev4.', 'GraphQL client in React'],
  // Docker is the base of Kubernetes
  ['dev11.', 'dev12.', 'Kubernetes orchestrates containers'],
  // Kubernetes runs on AWS
  ['dev12.', 'dev13.', 'EKS/ECS runs Kubernetes workloads'],
  // AWS resources provisioned by Terraform
  ['dev13.', 'dev14.', 'Terraform provisions AWS infra'],
  // Terraform runs inside CI/CD pipelines
  ['dev14.', 'dev16.', 'IaC deployed via pipelines'],
  // Tests gate CI/CD deployments
  ['dev15.', 'dev16.', 'tests gate deploys'],
  // Kubernetes needs observability
  ['dev12.', 'dev17.', 'K8s cluster metrics and logs'],
  // AWS CloudWatch is part of observability
  ['dev13.', 'dev17.', 'CloudWatch logs and metrics'],
  // Auth in AWS = IAM
  ['dev7.',  'dev13.', 'IAM is cloud-layer auth'],
  // Node.js is the runtime for REST APIs
  ['dev21.', 'dev6.',  'Node.js serves REST APIs'],
  // pgvector for AI embeddings lives in Postgres
  ['dev19.', 'dev8.',  'pgvector stores embeddings'],
  // AI/LLM calls made from Node.js
  ['dev19.', 'dev21.', 'LLM SDK runs in Node.js'],
  // System design is the top-level view of the data layer
  ['dev1.',  'dev8.',  'data layer design'],
  // System design encompasses infra/K8s
  ['dev1.',  'dev12.', 'distributed infra design'],
  // System design covers caching (Redis)
  ['dev1.',  'dev9.',  'caching strategy'],
  // RDS is managed Postgres
  ['dev8.',  'dev13.', 'RDS is managed Postgres'],
  // Git workflows underpin CI/CD
  ['dev18.', 'dev16.', 'Git events trigger pipelines'],
]

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

async function ensureDeckNode(uid: string, deckId: string, deckName: string): Promise<string> {
  const [deck] = await db
    .select({ nodeId: schema.srsDecks.nodeId })
    .from(schema.srsDecks)
    .where(and(eq(schema.srsDecks.id, deckId), eq(schema.srsDecks.ownerUid, uid)))
    .limit(1)

  if (deck?.nodeId) return deck.nodeId

  const nodeId = nanoid()
  await db.insert(schema.graphNodes).values({
    id: nodeId, graphId: 'default', ownerUid: uid,
    label: deckName, props: { kind: 'Deck', srsId: deckId }, ui: {},
  })
  await db.update(schema.srsDecks)
    .set({ nodeId, updatedAt: new Date() })
    .where(and(eq(schema.srsDecks.id, deckId), eq(schema.srsDecks.ownerUid, uid)))
  return nodeId
}

async function ensureEdge(uid: string, fromNodeId: string, toNodeId: string, label: string): Promise<boolean> {
  const existing = await db
    .select({ id: schema.graphEdges.id })
    .from(schema.graphEdges)
    .where(and(
      eq(schema.graphEdges.ownerUid, uid),
      eq(schema.graphEdges.type, 'RELATED_TO'),
      eq(schema.graphEdges.fromNodeId, fromNodeId),
      eq(schema.graphEdges.toNodeId, toNodeId),
    ))
    .limit(1)
  if (existing.length) return false

  await db.insert(schema.graphEdges).values({
    id: nanoid(), graphId: 'default', ownerUid: uid,
    type: 'RELATED_TO', fromNodeId, toNodeId, props: { label },
  })
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const uid = await getUid(email)
  console.log(`User: ${email} (${uid})\n`)

  // Fetch all dev decks
  const allDecks = await db
    .select({ id: schema.srsDecks.id, name: schema.srsDecks.name, nodeId: schema.srsDecks.nodeId })
    .from(schema.srsDecks)
    .where(eq(schema.srsDecks.ownerUid, uid))

  const devDecks = allDecks
    .filter(d => /^dev\d+\./.test(d.name))
    .sort((a, b) => {
      const na = parseInt(a.name.match(/^dev(\d+)/)![1])
      const nb = parseInt(b.name.match(/^dev(\d+)/)![1])
      return na - nb
    })

  if (devDecks.length === 0) {
    console.error('No dev decks found. Run seed-dev-decks.ts first.')
    process.exit(1)
  }

  console.log(`Found ${devDecks.length} dev decks:`)
  devDecks.forEach(d => console.log(`  ${d.name}`))

  // Ensure all have graph nodes
  console.log('\nSyncing graph nodes…')
  const nodeIds: Record<string, string> = {}
  for (const deck of devDecks) {
    nodeIds[deck.id] = await ensureDeckNode(uid, deck.id, deck.name)
  }
  const byPrefix = Object.fromEntries(devDecks.map(d => {
    const m = d.name.match(/^(dev\d+\.)/)
    return m ? [m[1], d] : []
  }))

  let created = 0, skipped = 0

  // ── Linear chain ────────────────────────────────────────────────────────────
  console.log('\nBuilding linear curriculum chain…')
  for (let i = 0; i < devDecks.length - 1; i++) {
    const from = devDecks[i]
    const to   = devDecks[i + 1]
    const ok = await ensureEdge(uid, nodeIds[from.id], nodeIds[to.id], 'builds on')
    if (ok) { created++; console.log(`  + ${from.name.slice(0, 30)} → ${to.name.slice(0, 30)}`) }
    else    { skipped++ }
  }

  // ── Cross-deck structural edges ─────────────────────────────────────────────
  console.log('\nBuilding cross-deck connections…')
  for (const [fromPrefix, toPrefix, label] of CROSS_EDGES) {
    const fromDeck = byPrefix[fromPrefix]
    const toDeck   = byPrefix[toPrefix]
    if (!fromDeck || !toDeck) {
      console.log(`  ! Missing deck for ${fromPrefix} or ${toPrefix} — skipping`)
      continue
    }
    const ok = await ensureEdge(uid, nodeIds[fromDeck.id], nodeIds[toDeck.id], label)
    if (ok) { created++; console.log(`  + ${fromDeck.name.slice(0, 22)} → ${toDeck.name.slice(0, 22)}  [${label}]`) }
    else    { skipped++; console.log(`  ~ already exists: ${fromPrefix} → ${toPrefix}`) }
  }

  console.log(`\n✅  Done — ${created} edges created, ${skipped} already existed.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => pool.end())
