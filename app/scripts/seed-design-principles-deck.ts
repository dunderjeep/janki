/**
 * seed-design-principles-deck.ts
 *
 * Creates "🎯 Software Design Principles" deck — nine principles with citations,
 * written as atomic single-phrase Q→A cards following Woźniak's 20 Rules:
 *   Rule 1  — minimum information (one fact per card)
 *   Rule 11 — optimise wording (shortest unambiguous phrasing)
 *   Rule 13 — provide context (enough to disambiguate)
 *   Rule 16 — provide sources (author, work, year in back)
 *
 * Sources:
 *   Rob Pike, "Notes on Programming in C" (1989)
 *   Linus Torvalds, Git mailing list (2006)
 *   Eric Evans, "Domain-Driven Design" (Addison-Wesley, 2003)
 *   Phil Karlton (attributed, ~1996)
 *   Dan McKinley, "Choose Boring Technology" (mcfunley.com, 2015)
 *   Tim Peters, "The Zen of Python" (PEP 20, 2004)
 *   Shigeo Shingo, "Zero Quality Control" (Productivity Press, 1986)
 *   Ron Jeffries / Kent Beck, "Extreme Programming Explained" (1999) — YAGNI
 *   Donald Knuth, "Computer Programming as an Art" (ACM, 1974)
 *   Martin Fowler, "Refactoring" (1999) — Rule of Three
 *   Yaron Minsky, Jane Street keynote (CUFP, 2011)
 *   Sam Newman, "Building Microservices" (O'Reilly, 2015)
 *   Michael Feathers, "Working Effectively with Legacy Code" (Prentice Hall, 2004)
 *   Hyrum Wright, hyrumslaw.com
 *
 * Usage:
 *   npx tsx scripts/seed-design-principles-deck.ts your@email.com
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

// Each card: [front, back]
// Back ends with a parenthetical citation where applicable (Woźniak Rule 16)

const CARDS: [string, string][] = [

  // ── PRINCIPLE 1 — DATA BEFORE UI ─────────────────────────────────────────

  ['Why design the data model before the UI?',
   'The schema is the hardest thing to change; errors compound into every layer above it. (Evans, DDD ch.1, 2003)'],

  ['Rob Pike on data structures vs algorithms?',
   '"Data dominates. If you\'ve chosen the right data structures, the algorithms will almost always be self-evident." (Pike, Notes on Programming in C, 1989)'],

  ['Linus Torvalds on good vs bad programmers?',
   '"Bad programmers worry about the code. Good programmers worry about data structures." (Torvalds, Git mailing list, 2006)'],

  ['What does DDD\'s "model is the design" mean?',
   'The domain model expressed in code IS the design — not a separate artefact. Ubiquitous language bridges code and domain experts. (Evans, DDD ch.2, 2003)'],

  // ── PRINCIPLE 2 — NAMING ─────────────────────────────────────────────────

  ['What are the two hard problems in CS (Karlton)?',
   'Cache invalidation and naming things. (Phil Karlton, attributed ~1996)'],

  ['What is DDD\'s "ubiquitous language"?',
   'A shared vocabulary used identically in code, conversation, and documentation — no translation layer. (Evans, DDD ch.2, 2003)'],

  ['Good name criterion (one rule)?',
   'A name should collapse the concept, not describe the machinery. `OrderPlaced` not `OrderStatusChangeEventHandler`.'],

  // ── PRINCIPLE 3 — BORING TECHNOLOGY ──────────────────────────────────────

  ['Dan McKinley\'s rule on new technology?',
   '"Add new technology only when the alternative is significantly worse." Each novel choice is a one-way door. (McKinley, Choose Boring Technology, 2015)'],

  ['Why prefer boring technology for infrastructure?',
   'The interesting part of a system should be the domain, not the infrastructure. Novel infra debt compounds at 2am.'],

  // ── PRINCIPLE 4 — ONE OBVIOUS WAY ────────────────────────────────────────

  ['Zen of Python rule on obvious paths?',
   '"There should be one — and preferably only one — obvious way to do it." (Peters, PEP 20, 2004)'],

  ['What is the "pit of success"?',
   'A design where the correct path is also the easiest path — the default leads to correct behaviour. (Mariani / Abrams, Microsoft, ~2003)'],

  ['What happens when two paths reach the same outcome?',
   'Both get used, data diverges, and bugs become invisible until they compound. Design one path.'],

  // ── PRINCIPLE 5 — READ BEFORE WRITE ──────────────────────────────────────

  ['What should you understand before designing a repository?',
   'The read/write ratio and the shape of data consumers need — ORM vs raw SQL, batch vs streaming all follow from this. (Fowler, PoEAA, 2002)'],

  // ── PRINCIPLE 6 — PUSH DECISIONS DOWN ────────────────────────────────────

  ['Sam Newman\'s microservices slogan on logic placement?',
   '"Smart endpoints, dumb pipes." Business logic lives at the endpoint, not the transport. (Newman, Building Microservices, O\'Reilly 2015)'],

  ['Yaron Minsky\'s type-system maxim?',
   '"Make illegal states unrepresentable." Encode constraints in types, not runtime checks. (Minsky, CUFP keynote, 2011)'],

  ['Client-side validation — what is it actually?',
   'UX, not correctness. Server-side or DB-level constraints are the only guarantees.'],

  // ── PRINCIPLE 7 — MAKE THE WRONG THING HARD ──────────────────────────────

  ['What is poka-yoke?',
   'Mistake-proofing — a mechanism that either prevents an error or makes it obvious immediately. (Shingo, Zero Quality Control, 1986)'],

  ['Poka-yoke applied to API design?',
   'Use distinct types for raw vs validated input so that using the wrong one is a compile error, not a runtime bug.'],

  // ── PRINCIPLE 8 — DEFER UNTIL IT HURTS ───────────────────────────────────

  ['What does YAGNI stand for?',
   'You Aren\'t Gonna Need It. (Jeffries / Beck, Extreme Programming Explained, 1999)'],

  ['Knuth on premature optimisation?',
   '"Premature optimisation is the root of all evil." (Knuth, Computer Programming as an Art, ACM 1974)'],

  ['The Rule of Three in refactoring?',
   'Abstract only on the third repetition — the first time is one-off, the second is coincidence, the third is a pattern. (Fowler, Refactoring, 1999)'],

  // ── PRINCIPLE 9 — THE SEAM IS THE API BOUNDARY ───────────────────────────

  ['What is a "seam" (Feathers)?',
   'A place where you can alter behaviour without editing that place — the boundary where substitution is possible. (Feathers, Working Effectively with Legacy Code, 2004)'],

  ['What is Hyrum\'s Law?',
   '"With enough users, all observable behaviours will be depended on, regardless of the contract." (Wright, hyrumslaw.com)'],

  ['Implication of Hyrum\'s Law for API design?',
   'Keep the observable surface small. Every extra observable behaviour is a future constraint you cannot remove.'],

  // ── CROSS-CUTTING ─────────────────────────────────────────────────────────

  ['Which principle does "one fact per card" mirror in code?',
   'Single-responsibility principle — a unit should do one thing. A card testing two facts is a function doing two things.'],

  ['Connection between minimum information (Woźniak) and SRP?',
   'Both are the same underlying rule: decompose until each unit has exactly one reason to change / one fact to retrieve. (Woźniak Rule 1, 1999; Martin, Clean Code, 2008)'],

]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-design-principles-deck.ts your@email.com'); process.exit(1) }

  const [user] = await db.select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers).where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }
  const uid = user.id

  const deckName = '🎯 Software Design Principles'

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
    description: 'Nine core software design principles: data-first, naming, boring technology, YAGNI, seams, poka-yoke. All cards cite primary sources.',
    active: true,
  })

  const cardRows = CARDS.map(([front, back]) => {
    const id = nanoid()
    return {
      card:  { id, deckId, ownerUid: uid, front, back, tags: [] as string[] },
      state: { id, deckId, ownerUid: uid, srs: newSrsState() },
    }
  })

  await db.insert(schema.srsCards).values(cardRows.map(r => r.card))
  await db.insert(schema.srsCardStates).values(cardRows.map(r => r.state))

  console.log(`✅ Created "${deckName}" with ${CARDS.length} cards.`)

  // Assign to "🖥️ Software Engineering" topic if it exists
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
