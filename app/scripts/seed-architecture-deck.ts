/**
 * seed-architecture-deck.ts
 *
 * Creates "🏛️ Architecture Mastery" deck — a structured, academically-grounded
 * approach to understanding existing architectures and designing new ones.
 *
 * Key sources cited on cards:
 *   - C4 Model (Simon Brown, 2018 — c4model.com)
 *   - Kruchten 4+1 Views (1995 IEEE Software)
 *   - ATAM — Architecture Tradeoff Analysis Method (SEI/CMU, Bass et al.)
 *   - arc42 (Starke & Hruschka — arc42.org, ISO 25010)
 *   - DDD (Eric Evans, 2003)
 *   - "Software Architecture in Practice" (Bass, Clements, Kazman — SEI)
 *
 * Usage:
 *   npx tsx scripts/seed-architecture-deck.ts your@email.com
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
// Grouped by theme for readability; all atomic single-concept pairs.

const CARDS: [string, string][] = [

  // ── UNDERSTANDING AN EXISTING ARCHITECTURE ───────────────────────────────────

  // The ordered questions — what to ask first
  ['First question for any system?',
   'What problem does it solve? Purpose drives all else. (arc42 §1)'],

  ['Second question after purpose?',
   'Who are the users and stakeholders? Their concerns shape all constraints. (arc42 §2)'],

  ['Third question — system boundary?',
   'What is the system context? External actors + adjacent systems. (C4 Level 1)'],

  ['Fourth question — inside the box?',
   'What are the deployment units? Apps, databases, services, queues. (C4 Level 2: Containers)'],

  ['Fifth question — communication?',
   'How do containers talk? Sync (REST/gRPC) vs async (events/queues). (arc42 §9)'],

  ['Sixth question — data ownership?',
   'Which service owns which data? No shared schemas in bounded contexts. (DDD)'],

  ['Seventh question — quality?',
   'What NFRs drive design? Performance, security, reliability. (ATAM / ISO 25010)'],

  ['Eighth question — failure modes?',
   'What happens when each part fails? Cascades, timeouts, circuit breakers.'],

  ['Ninth question — scale?',
   'What scales independently and why? CPU-bound vs I/O-bound vs data-bound.'],

  ['Tenth question — decisions?',
   'What ADRs exist? Why were key tradeoffs made? (Nygard 2011)'],

  // ── THE C4 MODEL ─────────────────────────────────────────────────────────────

  ['C4 Model — 4 levels in order?',
   'Context → Container → Component → Code. (Simon Brown, c4model.com)'],

  ['C4 Level 1: Context diagram shows?',
   'The system as a black box — external users and external systems.'],

  ['C4 Level 2: Container diagram shows?',
   'Inside the system — apps, data stores, microservices, each a deployable unit.'],

  ['C4 Level 3: Component diagram shows?',
   'Inside one container — major structural building blocks and their interactions.'],

  ['C4 Level 4: Code diagram shows?',
   'Implementation detail — UML class or entity diagram. Use sparingly.'],

  // ── KRUCHTEN 4+1 VIEWS ───────────────────────────────────────────────────────

  ['Kruchten 4+1 — the 5 views?',
   'Logical, Development, Process, Physical + Scenarios (+1). (IEEE Software 1995)'],

  ['Kruchten Logical view covers?',
   'Functional requirements — classes, packages, layers visible to end-users.'],

  ['Kruchten Process view covers?',
   'Non-functional: concurrency, synchronisation, runtime threads and processes.'],

  ['Kruchten Development view covers?',
   'Software management — modules, subsystems, layers, build and package structure.'],

  ['Kruchten Physical view covers?',
   'Mapping software to hardware — nodes, networks, deployment topology.'],

  // ── ATAM & QUALITY ATTRIBUTES ────────────────────────────────────────────────

  ['What is ATAM?',
   'Architecture Tradeoff Analysis Method — evaluates quality attributes against architectural decisions. (SEI/CMU)'],

  ['ATAM output?',
   'Risks, non-risks, sensitivity points, tradeoff points for each quality attribute scenario.'],

  ['ISO 25010 top quality attributes?',
   'Functional suitability, Performance, Reliability, Security, Maintainability, Portability.'],

  ['Sensitivity point (ATAM)?',
   'A decision that significantly affects one quality attribute.'],

  ['Tradeoff point (ATAM)?',
   'A decision that is a sensitivity point for two or more quality attributes — gains one, loses another.'],

  ['Quality attribute scenario structure?',
   'Stimulus → Source → Environment → Artifact → Response → Response measure.'],

  // ── DESIGNING A NEW ARCHITECTURE ─────────────────────────────────────────────

  ['First design question for a new system?',
   'What must it DO? Functional requirements — user stories, use cases.'],

  ['Second design question?',
   'What must it BE? Non-functional requirements — quality attribute scenarios.'],

  ['When to choose a monolith?',
   'Small team, simple domain, low operational complexity, fast iteration needed.'],

  ['When to choose microservices?',
   'Team autonomy, independent deployability, different scaling per service, fault isolation.'],

  ['Conway\'s Law?',
   'System design mirrors the team communication structure. Design teams to match desired architecture.'],

  // ── DOMAIN-DRIVEN DESIGN ─────────────────────────────────────────────────────

  ['DDD: first decomposition question?',
   'What are the bounded contexts? Where language and model are internally consistent. (Evans 2003)'],

  ['Bounded context boundary rule?',
   'One model per context. Ubiquitous language is unambiguous within a context, not across.'],

  ['DDD: Aggregate?',
   'A cluster of objects treated as a unit for data changes — only root is accessible from outside.'],

  ['DDD: Domain Event?',
   'Something that happened in the domain — named in past tense (OrderPlaced, UserRegistered).'],

  ['Context Map — anti-corruption layer?',
   'A translation layer between bounded contexts to prevent foreign model leaking in.'],

  // ── ARCHITECTURE PATTERNS ─────────────────────────────────────────────────────

  ['Hexagonal architecture (Ports & Adapters)?',
   'Domain at centre; ports define interfaces; adapters connect UI, DB, APIs. (Cockburn 2005)'],

  ['Clean Architecture layers (inner→outer)?',
   'Entities → Use Cases → Interface Adapters → Frameworks/Drivers. Depend inward only.'],

  ['CQRS?',
   'Command Query Responsibility Segregation — separate models for reads and writes.'],

  ['Event Sourcing?',
   'Store state as an immutable log of events; derive current state by replaying.'],

  ['Saga pattern?',
   'Distributed transaction via local transactions + compensating transactions for rollback.'],

  ['Strangler Fig pattern?',
   'Incrementally replace legacy by routing new features to new system, old to legacy. (Fowler)'],

  ['Database per service pattern?',
   'Each service owns its data store — no shared schema — enables independent evolution.'],

  // ── ARCHITECTURE DECISION RECORDS ────────────────────────────────────────────

  ['What is an ADR?',
   'Architecture Decision Record — documents a decision, its context, and its consequences. (Nygard 2011)'],

  ['ADR sections?',
   'Title · Status · Context · Decision · Consequences. Status: proposed / accepted / deprecated / superseded.'],

  ['Why ADRs matter?',
   'Future readers need the WHY, not just the WHAT. Prevents relitigating settled decisions.'],

  // ── ARC42 TEMPLATE ───────────────────────────────────────────────────────────

  ['arc42 — how many sections?',
   '12 sections: Goals, Constraints, Context, Solution Strategy, Building Blocks, Runtime, Deployment, Concepts, Decisions, Quality, Risks, Glossary.'],

  ['arc42 section 1?',
   'Requirements overview + quality goals + stakeholders. (arc42.org)'],

  ['arc42 solution strategy (§4)?',
   'Top-level decisions: technology choices, decomposition approach, quality achievement approach.'],

  // ── FITNESS FUNCTIONS & GOVERNANCE ───────────────────────────────────────────

  ['Architectural fitness function?',
   'Automated check that verifies an architectural characteristic (coupling, test coverage, cycle time). (Building Evolutionary Architectures)'],

  ['Coupling metric ArchUnit / Dependency Check?',
   'Verifies no circular dependencies, no forbidden layer violations — runnable in CI.'],

  ['When to run fitness functions?',
   'As part of CI — fail the build when architectural properties degrade.'],

  // ── CAP & DISTRIBUTED TRADE-OFFS ─────────────────────────────────────────────

  ['CAP theorem choices?',
   'CP (consistency + partition tolerance) or AP (availability + partition tolerance). Never all three.'],

  ['PACELC extension of CAP?',
   'When no partition (E): choose Latency or Consistency. ELC extends CAP to normal operation.'],

  ['Backpressure?',
   'Signal from consumer to producer to slow down — prevents unbounded queue growth.'],

  ['Circuit breaker states?',
   'Closed (normal) → Open (failing, reject calls) → Half-open (probe recovery). (Nygard)'],
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-architecture-deck.ts your@email.com'); process.exit(1) }

  const [user] = await db.select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers).where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }
  const uid = user.id

  const deckName = '🏛️ Architecture Mastery'

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
    description: 'Systematic approach to understanding & designing architectures. C4, ATAM, arc42, DDD, ADRs.',
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

  // Assign to "🚀 Senior Dev Fluency" topic if it exists
  const [seniorTopic] = await db.select({ id: schema.srsTopics.id })
    .from(schema.srsTopics)
    .where(and(eq(schema.srsTopics.ownerUid, uid), eq(schema.srsTopics.name, '🚀 Senior Dev Fluency')))

  if (seniorTopic) {
    await db.insert(schema.srsTopicDecks)
      .values({ topicId: seniorTopic.id, deckId })
      .onConflictDoNothing()
    console.log(`  → Assigned to "🚀 Senior Dev Fluency"`)
  }

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
