/**
 * seed-topics.ts
 *
 * Creates a first-pass topic hierarchy and assigns existing decks to topics.
 *
 * Usage:
 *   npx tsx scripts/seed-topics.ts your@email.com
 *
 * Idempotent — skips topics that already exist (matched by name + ownerUid).
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as schema from '../src/db/schema/janki'
import * as authSchema from '../src/db/schema/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db   = drizzle(pool, { schema: { ...schema, ...authSchema } })

// ── Topic tree definition ──────────────────────────────────────────────────────
//
// Each entry: { name, color?, children?, decks? }
// decks: partial deck name substrings (case-insensitive match)

type TopicDef = {
  name: string
  color?: string
  children?: TopicDef[]
  decks?: string[]   // substrings to match against deck names
}

const TOPIC_TREE: TopicDef[] = [
  {
    name: '🌲 Forestry & Field Science',
    color: '#16a34a',
    children: [
      {
        name: '🇳🇴 Norway Forestry Biometrics',
        color: '#4ade80',
        decks: [
          'PostgreSQL Advanced',
          'dbt Mastery',
          'PostGIS',
          'Norwegian Forest Biometrics',
          'Expert Domain',
          'Dendrometer',
          'LiDAR',
          'FAIR Data',
          'Directus',
          'Authoritative Citations',
          'Forestry 101',
        ],
      },
      {
        name: '🌿 Horticulture & Gardening',
        color: '#86efac',
        decks: ['Master Gardener'],
      },
    ],
  },
  {
    name: '🧮 Computing Theory',
    color: '#7c3aed',
    children: [
      {
        name: '🔴 P vs NP — Full Track',
        color: '#a78bfa',
        decks: [
          'pnp1.', 'pnp2.', 'pnp3.', 'pnp4.', 'pnp5.', 'pnp6.', 'pnp7.',
          'pnp8.', 'pnp9.', 'pnp10.', 'pnp11.', 'pnp12.', 'pnp13.', 'pnp14.',
          'pnp15.', 'pnp16.', 'pnp17.', 'pnp18.', 'pnp19.', 'pnp20.',
          'pnp21.', 'pnp22.', 'pnp23.', 'pnp24.', 'pnp25.', 'pnp26.',
          'pnp27.', 'pnp28.', 'pnp29.',
        ],
      },
      {
        name: '🏆 Millennium Prize Problems',
        color: '#ddd6fe',
        decks: ['Millenium Prize Problems'],
      },
    ],
  },
  {
    name: '📐 Mathematics & Physics',
    color: '#0369a1',
    children: [
      {
        name: '📊 Statistics & Probability',
        color: '#38bdf8',
        decks: ['Bayesian Statistics'],
      },
      {
        name: '∫ Calculus',
        color: '#7dd3fc',
        decks: ['Calculus 101'],
      },
      {
        name: '⚛️ Physics',
        color: '#bae6fd',
        decks: ['Physics Level 1'],
      },
    ],
  },
  {
    name: '🖥️ Software Engineering',
    color: '#b45309',
    children: [
      {
        name: '🗄️ Databases & Data',
        color: '#fbbf24',
        decks: ['Postgres'],
      },
      {
        name: '🔒 Networking & Security',
        color: '#fde68a',
        decks: ['CCNA', 'Cybersecurity'],
      },
      {
        name: '🤖 AI & ML',
        color: '#fef3c7',
        decks: ['predict flashcards'],
      },
    ],
  },
  {
    name: '🧬 Life Sciences & Medicine',
    color: '#be123c',
    children: [
      {
        name: '🧠 Neuroscience & Psychology',
        color: '#fb7185',
        decks: ['Neuroscience', 'Psychiatry'],
      },
      {
        name: '💊 Pharmacology & Physiology',
        color: '#fda4af',
        decks: ['Pharmacology', 'Cardiovascular'],
      },
      {
        name: '🧪 Chemistry',
        color: '#fecdd3',
        decks: ['Organic Chemistry'],
      },
    ],
  },
  {
    name: '🗣️ Languages',
    color: '#0e7490',
    children: [
      {
        name: '🇫🇷 French',
        color: '#22d3ee',
        decks: ['French'],
      },
      {
        name: '🇳🇴 Norwegian',
        color: '#a5f3fc',
        decks: ['Norwegian Language', 'Survival Norwegian'],
      },
    ],
  },
  {
    name: '📚 General Knowledge',
    color: '#64748b',
    children: [
      {
        name: '🏢 Organizations & Society',
        color: '#94a3b8',
        decks: ['Organization Theory'],
      },
      {
        name: '📡 Radio & Communications',
        color: '#cbd5e1',
        decks: ['Canadian Amateur Radio'],
      },
    ],
  },
  {
    name: '🔗 Reference & Connections',
    color: '#78716c',
    decks: ['Connections'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureTopic(
  ownerUid: string,
  name: string,
  color: string | null,
  sortOrder: number,
): Promise<string> {
  const existing = await db
    .select({ id: schema.srsTopics.id })
    .from(schema.srsTopics)
    .where(and(eq(schema.srsTopics.ownerUid, ownerUid), eq(schema.srsTopics.name, name)))
  if (existing[0]) {
    console.log(`  skip topic: "${name}"`)
    return existing[0].id
  }
  const id = nanoid()
  await db.insert(schema.srsTopics).values({ id, ownerUid, name, color, sortOrder })
  console.log(`  + topic: "${name}"`)
  return id
}

async function assignDeck(topicId: string, deckId: string, deckName: string) {
  await db.insert(schema.srsTopicDecks).values({ topicId, deckId }).onConflictDoNothing()
  console.log(`    → deck: "${deckName}"`)
}

async function seedTree(
  ownerUid: string,
  allDecks: { id: string; name: string }[],
  nodes: TopicDef[],
  parentId: string | null,
  depth: number,
  sortBase: number,
): Promise<void> {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const sortOrder = sortBase * 100 + i
    const topicId = await ensureTopic(ownerUid, node.name, node.color ?? null, sortOrder)

    // Link to parent
    if (parentId) {
      await db.insert(schema.srsTopicParents)
        .values({ topicId, parentId })
        .onConflictDoNothing()
    }

    // Assign matching decks
    if (node.decks) {
      for (const pattern of node.decks) {
        const matched = allDecks.filter(d =>
          d.name.toLowerCase().includes(pattern.toLowerCase())
        )
        for (const deck of matched) {
          await assignDeck(topicId, deck.id, deck.name)
        }
      }
    }

    // Recurse
    if (node.children) {
      await seedTree(ownerUid, allDecks, node.children, topicId, depth + 1, sortBase * 100 + i + 1)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-topics.ts your@email.com'); process.exit(1) }

  // Resolve user
  const [user] = await db
    .select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers)
    .where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }

  const uid = user.id
  console.log(`Seeding topics for uid: ${uid}\n`)

  const allDecks = await db
    .select({ id: schema.srsDecks.id, name: schema.srsDecks.name })
    .from(schema.srsDecks)
    .where(eq(schema.srsDecks.ownerUid, uid))

  console.log(`Found ${allDecks.length} decks\n`)

  await seedTree(uid, allDecks, TOPIC_TREE, null, 0, 0)

  console.log('\n✅ Topics seeded.')
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
