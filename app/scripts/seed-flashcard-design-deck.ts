/**
 * seed-flashcard-design-deck.ts
 *
 * Creates "🃏 Atomic Flashcard Design" deck — the principles behind writing
 * high-quality spaced-repetition cards: one atomic fact per card,
 * minimum information, cloze vs Q&A, and the connection to SRP in code.
 *
 * Key sources:
 *   - Piotr Woźniak, "20 Rules of Formulating Knowledge" (SuperMemo, 1999)
 *   - Michael Nielsen, "Augmenting Long-term Memory" (2018)
 *   - Andy Matuschak, "How to write good prompts" (andymatuschak.org, 2020)
 *   - Soren Bjornstad, "Making Better Anki Cards" (blog, 2020)
 *
 * Usage:
 *   npx tsx scripts/seed-flashcard-design-deck.ts your@email.com
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

function newSrsState(): schema.SrsObject {
  return {
    state: 'new', dueAt: new Date().toISOString(),
    lastReviewedAt: null, stability: 0, difficulty: 0, reps: 0, lapses: 0,
  }
}

// ── Cards ──────────────────────────────────────────────────────────────────────
// Format: [front, back]
// Each card encodes exactly one retrievable fact — practising what it preaches.

const CARDS: [string, string][] = [

  // ── THE ATOMIC PRINCIPLE ──────────────────────────────────────────────────

  ['Minimum information principle?',
   'Simpler material is easier to remember. One card = one fact. (Woźniak, 20 Rules #1, SuperMemo 1999)'],

  ['Why does one-fact-per-card work?',
   'Memory retrieval is all-or-nothing per item. A multi-part answer fails entirely if one part is forgotten.'],

  ['Single-responsibility in code vs cards?',
   'Both are the same principle: a unit should do one thing. A card that tests two facts is a function doing two things.'],

  ['How long should a card answer be?',
   'One clause, one sentence at most. If the answer needs "and", it needs two cards. (Nielsen, Augmenting LTM, 2018)'],

  ['What does a long answer signal?',
   'The question is doing too much work. Split it. (Woźniak Rule #4: minimum information)'],

  // ── QUESTION DESIGN ───────────────────────────────────────────────────────

  ['Ideal front-of-card format?',
   'One short phrase posing exactly one retrieval cue. Avoid "list all..." prompts. (Matuschak, "How to write good prompts", 2020)'],

  ['Why avoid "list all X" cards?',
   'Order and completeness are not recalled together. Lists foster illusion of knowing. Write one card per item instead.'],

  ['Cloze deletion — when to prefer it?',
   'When the blank is the exact fact to learn and surrounding context aids recall. Good for names, dates, formulas. (Woźniak Rule #11)'],

  ['Q&A vs cloze — which is atomic?',
   'Both can be atomic. Q&A is better when the retrieval cue needs to be phrased differently from the answer.'],

  ['What makes a retrieval cue strong?',
   'It uniquely implies exactly one answer. Weak cues accept multiple answers — the card is testing guessing, not memory.'],

  // ── COMMON FAILURE MODES ─────────────────────────────────────────────────

  ['Enumeration card failure mode?',
   'You memorise order, not meaning. You pass the card without understanding any individual item. (Woźniak Rule #6)'],

  ['"What is X?" card failure mode?',
   'The question is too open. "What is a pointer?" has 20 valid answers. "What does a pointer store?" has one.'],

  ['Copy-paste card failure mode?',
   'Textbook sentences lack the cognitive effort of reformulation. You recognise, not recall. Rewrite in your own words.'],

  ['Orphan card failure mode?',
   'A card with no links to other knowledge. Isolated facts fade fastest. Add context or connect to a related card. (Nielsen 2018)'],

  ['Bidirectional card — when useful?',
   'Term → definition AND definition → term. Use when recognition AND production are both needed (e.g., vocabulary).'],

  // ── WRITING PROCESS ───────────────────────────────────────────────────────

  ['When to write cards — before or after understanding?',
   'After. Cards reinforce understanding; they cannot create it. (Nielsen: reading first, cards second)'],

  ['Best source for card content?',
   'Your own reformulation of the source, not the source text itself. Reformulation forces encoding. (Matuschak 2020)'],

  ['How to convert a paragraph into cards?',
   'Identify each atomic claim. Write one card per claim. Discard anything you will never need to retrieve.'],

  ['Should a card include context?',
   'Minimal context only — enough to disambiguate, not enough to give away the answer.'],

  ['How to handle a formula?',
   'One card per variable relationship. "What does σ represent in FSRS?" not "State the full FSRS formula."'],

  // ── QUALITY SIGNALS ───────────────────────────────────────────────────────

  ['Sign of a good card at review time?',
   'You either know it instantly or you clearly don\'t. No "sort of" — that means the question is ambiguous.'],

  ['Sign of a bad card at review time?',
   'You pass it by guessing one of several plausible answers. The retrieval cue is under-constrained.'],

  ['What is the "20-second rule" for cards?',
   'If answering takes more than 20 seconds consistently, the card is too complex. Split or simplify. (Bjornstad 2020)'],

  ['Leech card — what is it?',
   'A card that is repeatedly failed. Usually signals a bad card, not a hard fact. Rewrite before adding leeches to a special deck.'],

  // ── CONNECTION TO SPACED REPETITION ───────────────────────────────────────

  ['Why does card atomicity matter for FSRS scheduling?',
   'FSRS models stability per item. A multi-fact card has one stability score but multiple independent forgetting rates — they conflict.'],

  ['How does atomicity affect retention curves?',
   'Atomic cards have clean sigmoid retention curves. Compound cards have jagged curves — one sub-fact drags the whole card back.'],

  ['What is the forgetting index?',
   'Target probability of forgetting at review time. Woźniak recommends 10% (90% retention). Lower = more reviews. (SuperMemo)'],

]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-flashcard-design-deck.ts your@email.com'); process.exit(1) }

  const [user] = await db.select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers).where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }
  const uid = user.id

  const deckName = '🃏 Atomic Flashcard Design'

  const existing = await db.select({ id: schema.srsDecks.id })
    .from(schema.srsDecks)
    .where(and(eq(schema.srsDecks.ownerUid, uid), eq(schema.srsDecks.name, deckName)))
  if (existing[0]) {
    console.log(`Deck "${deckName}" already exists — skipping.`)
    await pool.end(); return
  }

  const deckId = nanoid()
  await db.insert(schema.srsDecks).values({
    id: deckId,
    ownerUid: uid,
    name: deckName,
    description: 'How to write high-quality spaced-repetition cards. Woźniak 20 Rules, Nielsen, Matuschak. One atomic fact per card.',
    active: true,
  })

  const cardRows = CARDS.map(([front, back]) => {
    const id = nanoid()
    return { card: { id, deckId, ownerUid: uid, front, back, tags: [] as string[] },
             state: { id, deckId, ownerUid: uid, srs: newSrsState() } }
  })

  await db.insert(schema.srsCards).values(cardRows.map(r => r.card))
  await db.insert(schema.srsCardStates).values(cardRows.map(r => r.state))

  console.log(`✅ Created "${deckName}" with ${CARDS.length} cards.`)

  // Assign to "🛠️ Software Engineering" topic if it exists
  const [seTopic] = await db.select({ id: schema.srsTopics.id })
    .from(schema.srsTopics)
    .where(and(eq(schema.srsTopics.ownerUid, uid), eq(schema.srsTopics.name, '🖥️ Software Engineering')))

  if (seTopic) {
    await db.insert(schema.srsTopicDecks)
      .values({ topicId: seTopic.id, deckId })
      .onConflictDoNothing()
    console.log(`  → Assigned to "🖥️ Software Engineering"`)
  } else {
    console.log(`  ℹ️  "🖥️ Software Engineering" topic not found — assign manually.`)
  }

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
