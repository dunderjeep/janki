/**
 * seed-yang-mills.ts
 *
 * Creates "⚛️ Yang-Mills Theory" deck demonstrating [[wikilink]] drill-down.
 *
 * Structure:
 *   1. One top-level reference card — the full Yang-Mills action with LaTeX,
 *      back is a labelled map of every term (uses [[wikilinks]])
 *   2. Component cards for each sub-concept (each also uses [[wikilinks]]
 *      to concepts one level deeper)
 *
 * This illustrates the pack/unpack learning strategy:
 *   - Reference card keeps the whole formula in view
 *   - Component cards build deep understanding of each part
 *   - [[wikilinks]] let you drill to any concept inline during review
 *
 * Sources:
 *   Yang & Mills, "Conservation of Isotopic Spin", Phys. Rev. 96, 1954
 *   Peskin & Schroeder, "Introduction to Quantum Field Theory", 1995
 *   Weinberg, "The Quantum Theory of Fields", Vol.2, 1996
 *   Baez & Muniain, "Gauge Fields, Knots and Gravity", 1994
 *
 * Usage:
 *   npx tsx scripts/seed-yang-mills.ts your@email.com
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
  return { state: 'new', dueAt: new Date().toISOString(), lastReviewedAt: null, stability: 0, difficulty: 0, reps: 0, lapses: 0 }
}

// Cards: [front, back]
// [[wikilinks]] are used throughout — clicking them during study shows
// the linked card's back or generates a stub card if none exists yet.

const CARDS: [string, string][] = [

  // ── REFERENCE CARD (pack level — keep the whole picture) ─────────────────

  ['Yang-Mills action — full formula',
   `$$S_{YM} = -\\frac{1}{2g^2} \\int \\text{Tr}(F_{\\mu\\nu} F^{\\mu\\nu})\\, d^4x$$

Where:
- $F_{\\mu\\nu}$ = [[field strength tensor]] (curvature of the [[gauge field]])
- $g$ = [[coupling constant]] (interaction strength)
- $\\text{Tr}$ = [[trace over Lie algebra]] (makes the action gauge-invariant)
- $F^{\\mu\\nu}$ raised with the [[Minkowski metric]] $\\eta^{\\mu\\rho}\\eta^{\\nu\\sigma}$

Reduces to [[Maxwell's equations]] when the [[gauge group]] is $U(1)$.
(Yang & Mills, Phys. Rev. 96, 1954)`],

  // ── FIELD STRENGTH TENSOR ────────────────────────────────────────────────

  ['Yang-Mills field strength tensor $F_{\\mu\\nu}$?',
   `$$F_{\\mu\\nu} = \\partial_\\mu A_\\nu - \\partial_\\nu A_\\mu + g[A_\\mu, A_\\nu]$$

$A_\\mu$ is the [[gauge field]] (a [[Lie algebra]]-valued [[1-form]]).
The extra term $g[A_\\mu, A_\\nu]$ vs [[Maxwell's field tensor]] encodes [[self-interaction of gauge bosons]].
(Peskin & Schroeder §15.1, 1995)`],

  ['Why does Yang-Mills have a commutator term $[A_\\mu, A_\\nu]$?',
   'Because the [[gauge group]] is non-abelian — the [[gauge bosons]] carry [[colour charge]] themselves and interact. In [[Maxwell\'s equations]] ($U(1)$ gauge group), this term vanishes because $[A_\\mu, A_\\nu] = 0$. (Weinberg, QFT Vol.2 §15.1, 1996)'],

  ['How does Yang-Mills reduce to Maxwell?',
   'Set the [[gauge group]] to $U(1)$ (abelian). Then $[A_\\mu, A_\\nu] = 0$, so $F_{\\mu\\nu} = \\partial_\\mu A_\\nu - \\partial_\\nu A_\\mu$ — exactly the [[Maxwell field tensor]]. (Baez & Muniain ch.4, 1994)'],

  // ── GAUGE FIELD ──────────────────────────────────────────────────────────

  ['What is the gauge field $A_\\mu$ in Yang-Mills?',
   'A [[Lie algebra]]-valued [[1-form]] on spacetime — the [[connection]] on a [[principal G-bundle]]. For [[QCD]], $A_\\mu$ takes values in $\\mathfrak{su}(3)$ and has $8$ components (one per [[gluon]]). (Baez & Muniain ch.4, 1994)'],

  ['What physical particles does $A_\\mu$ represent?',
   'The [[gauge bosons]]: [[photon]] for $U(1)$, [[W and Z bosons]] for $SU(2)$, [[gluons]] for $SU(3)$. Collectively the [[force carriers]] of the [[Standard Model]].'],

  // ── GAUGE INVARIANCE ─────────────────────────────────────────────────────

  ['Yang-Mills gauge transformation — what does it look like?',
   `Under a local gauge transformation $g(x) \\in G$:
$$A_\\mu \\to g A_\\mu g^{-1} - (\\partial_\\mu g) g^{-1}$$
$$F_{\\mu\\nu} \\to g F_{\\mu\\nu} g^{-1}$$
The action $S_{YM}$ is invariant because $\\text{Tr}(F^2)$ is invariant under [[adjoint action]]. (Peskin & Schroeder §15.2, 1995)`],

  ['Why is the trace $\\text{Tr}(F_{\\mu\\nu}F^{\\mu\\nu})$ necessary?',
   'Without the trace, $F_{\\mu\\nu}F^{\\mu\\nu}$ is a [[Lie algebra]]-valued scalar — not a number. The [[Killing form]] (= trace in the [[adjoint representation]]) maps it to a real scalar. Gauge invariance then holds because $\\text{Tr}(gXg^{-1}) = \\text{Tr}(X)$. (Weinberg §15.2, 1996)'],

  // ── EQUATIONS OF MOTION ──────────────────────────────────────────────────

  ['Yang-Mills equations of motion?',
   `$$D^\\mu F_{\\mu\\nu} = J_\\nu$$
where $D_\\mu = \\partial_\\mu + g[A_\\mu, \\cdot]$ is the [[covariant derivative]] and $J_\\nu$ is the [[matter current]]. Generalises [[Maxwell\'s equations]] $\\partial^\\mu F_{\\mu\\nu} = J_\\nu$ to non-abelian gauge groups. (Peskin & Schroeder §15.3)`],

  ['What is the Bianchi identity in Yang-Mills?',
   '$$D_{[\\mu} F_{\\nu\\rho]} = 0$$ — the covariant exterior derivative of $F$ vanishes identically, just as $\\partial_{[\\mu}F_{\\nu\\rho]}=0$ in [[electromagnetism]]. It encodes the absence of [[magnetic monopoles]] in the non-abelian theory. (Baez & Muniain §IV.2)'],

  // ── COUPLING & QUANTISATION ──────────────────────────────────────────────

  ['What is the Yang-Mills coupling constant $g$?',
   'Controls the strength of the [[gauge interaction]]. In [[QCD]], $g_s$ runs with energy ([[asymptotic freedom]]): strong at low energies, weak at high energies. Related to the [[fine structure constant]] analogue $\\alpha_s = g_s^2 / 4\\pi$.'],

  ['Yang-Mills Millennium Problem — what is asked?',
   'Prove existence and a [[mass gap]] for Yang-Mills in $\\mathbb{R}^4$: that the quantum theory exists (rigorously) and that the lowest non-zero energy eigenvalue is strictly positive. Worth $1M (Clay Mathematics Institute, 2000). The gap explains why [[gluons]] are confined but not observed freely.'],

  // ── CONNECTIONS TO PHYSICS ───────────────────────────────────────────────

  ['Which physical theories ARE Yang-Mills theories?',
   '[[QCD]] ($SU(3)$ — strong force), [[electroweak theory]] ($SU(2) \\times U(1)$ — weak + EM), and all of the [[Standard Model]] gauge sector. [[General relativity]] has a Yang-Mills-like structure with the [[Christoffel connection]] playing the role of $A_\\mu$.'],

  ['Difference between Abelian ($U(1)$) and non-Abelian gauge theories?',
   'Abelian: gauge bosons do not self-interact ($[A_\\mu,A_\\nu]=0$). Non-Abelian: gauge bosons carry charge and interact cubically and quartically ($3$- and $4$-point vertices in the [[Feynman rules]]). This makes [[QCD]] [[asymptotically free]] but also leads to [[confinement]]. (Peskin & Schroeder §16)'],
]

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-yang-mills.ts your@email.com'); process.exit(1) }

  const [user] = await db.select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers).where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }
  const uid = user.id

  const deckName = '⚛️ Yang-Mills Theory'
  const existing = await db.select({ id: schema.srsDecks.id })
    .from(schema.srsDecks).where(and(eq(schema.srsDecks.ownerUid, uid), eq(schema.srsDecks.name, deckName)))
  if (existing[0]) { console.log(`"${deckName}" already exists — skipping.`); await pool.end(); return }

  const deckId = nanoid()
  await db.insert(schema.srsDecks).values({
    id: deckId, ownerUid: uid, name: deckName, active: true,
    description: 'Yang-Mills gauge theory — from the full action to every component term. Uses [[wikilinks]] for inline drill-down. Sources: Peskin & Schroeder, Weinberg, Baez & Muniain.',
  })

  const rows = CARDS.map(([front, back]) => {
    const id = nanoid()
    return { card: { id, deckId, ownerUid: uid, front, back, tags: ['physics', 'gauge-theory'] as string[] },
             state: { id, deckId, ownerUid: uid, srs: newSrsState() } }
  })
  await db.insert(schema.srsCards).values(rows.map(r => r.card))
  await db.insert(schema.srsCardStates).values(rows.map(r => r.state))
  console.log(`✅ "${deckName}" — ${CARDS.length} cards.`)

  // Assign to Physics topic if it exists
  for (const name of ['🔬 Physics', '🖥️ Software Engineering', '⚗️ Science']) {
    const [t] = await db.select({ id: schema.srsTopics.id }).from(schema.srsTopics)
      .where(and(eq(schema.srsTopics.ownerUid, uid), eq(schema.srsTopics.name, name)))
    if (t) {
      await db.insert(schema.srsTopicDecks).values({ topicId: t.id, deckId }).onConflictDoNothing()
      console.log(`  → Assigned to "${name}"`)
      break
    }
  }
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
