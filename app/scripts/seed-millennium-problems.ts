/**
 * seed-millennium-problems.ts
 *
 * Creates "🏆 Millennium Prize Problems" deck — seven open problems in mathematics,
 * each stated precisely with [[wikilinks]] to every sub-concept, so drilling
 * down from any problem reaches fundamental definitions.
 *
 * Six remain unsolved (2025). One solved: Poincaré Conjecture (Perelman, 2003).
 *
 * Sources:
 *   Clay Mathematics Institute, "Millennium Prize Problems" (2000)
 *   Jaffe & Quinn, problem descriptions on claymath.org
 *   Individual problem statements from official CMI descriptions
 *
 * Usage:
 *   npx tsx scripts/seed-millennium-problems.ts your@email.com
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

const CARDS: [string, string][] = [

  // ── OVERVIEW ─────────────────────────────────────────────────────────────

  ['What are the Millennium Prize Problems?',
   'Seven problems posed by the [[Clay Mathematics Institute]] in 2000, each carrying a $1M prize. Six remain unsolved (2025). The one solved: [[Poincaré Conjecture]] (Perelman, 2003). They span [[topology]], [[number theory]], [[complexity theory]], [[PDEs]], and [[quantum field theory]]. (claymath.org/millennium-problems)'],

  // ── P vs NP ──────────────────────────────────────────────────────────────

  ['P vs NP — state the problem.',
   'Does $P = NP$? That is: if a solution to a problem can be *verified* in [[polynomial time]] ([[NP]]), can it always be *found* in polynomial time ([[P]])? Most believe $P \\neq NP$ but no proof exists. Implications: if $P = NP$, most [[cryptography]] collapses. (Cook, 1971; CMI 2000)'],

  ['What is a problem in P?',
   'Solvable by a [[deterministic Turing machine]] in time $O(n^k)$ for some constant $k$. Examples: [[sorting]], [[shortest path]], [[linear programming]]. (Cobham, 1965)'],

  ['What is a problem in NP?',
   'A [[decision problem]] whose YES-instances have solutions verifiable in [[polynomial time]]. Equivalently, solvable by a [[non-deterministic Turing machine]] in polynomial time. Every problem in $P$ is also in $NP$. (Cook, 1971)'],

  ['What is an NP-complete problem?',
   'A problem in [[NP]] to which every other NP problem reduces in [[polynomial time]] ([[polynomial reduction]]). Examples: [[Boolean satisfiability]] (SAT), [[travelling salesman]] (decision), [[graph colouring]]. If any NP-complete problem is in P, then $P = NP$. (Karp, 1972)'],

  // ── RIEMANN HYPOTHESIS ───────────────────────────────────────────────────

  ['Riemann Hypothesis — state it.',
   'All non-trivial [[zeros of the Riemann zeta function]] $\\zeta(s)$ lie on the [[critical line]] $\\text{Re}(s) = \\frac{1}{2}$. The trivial zeros at $s = -2, -4, -6, \\ldots$ are excluded. Controls the distribution of [[prime numbers]] via the [[prime counting function]] $\\pi(x)$. (Riemann, 1859; CMI 2000)'],

  ['Riemann zeta function $\\zeta(s)$ — definition?',
   '$$\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s} = \\prod_{p\\text{ prime}} \\frac{1}{1-p^{-s}}$$\nConverges for $\\text{Re}(s) > 1$; extended to $\\mathbb{C} \\setminus \\{1\\}$ by [[analytic continuation]]. The [[Euler product]] encodes all primes. (Riemann, 1859)'],

  ['Connection between Riemann Hypothesis and prime distribution?',
   'The error in the [[prime number theorem]] $\\pi(x) \\approx x/\\ln x$ is bounded by the real parts of the [[zeros of ζ]]. If RH holds, the error is $O(\\sqrt{x} \\ln x)$ — the best possible. Without RH, the bound is weaker. (von Koch, 1901)'],

  // ── YANG-MILLS EXISTENCE AND MASS GAP ────────────────────────────────────

  ['Yang-Mills mass gap problem — state it.',
   'For any [[compact simple gauge group]] $G$, prove that [[quantum Yang-Mills theory]] on $\\mathbb{R}^4$ exists rigorously (as a [[quantum field theory]]) and has a [[mass gap]] $\\Delta > 0$: the infimum of the spectrum of the [[Hamiltonian]] on the orthogonal complement of the [[vacuum state]] is strictly positive. (Jaffe & Witten, CMI 2000)'],

  ['Why does the mass gap matter for physics?',
   'It explains [[confinement]]: [[gluons]] and [[quarks]] are never seen in isolation because creating a separated [[colour charge]] costs infinite energy. The mass gap is why the [[strong force]] is short-range despite the [[gauge boson]] ($gluon$) being massless at the classical level. (Witten, 2000)'],

  // ── NAVIER-STOKES ────────────────────────────────────────────────────────

  ['Navier-Stokes existence and smoothness — state the problem.',
   'In $\\mathbb{R}^3$, do smooth solutions to the [[Navier-Stokes equations]] always exist for all time, given smooth initial data with finite energy? Or can solutions develop singularities ([[blow-up]]) in finite time? (CMI 2000)'],

  ['Navier-Stokes equations — what do they describe?',
   '$$\\rho\\left(\\frac{\\partial \\mathbf{u}}{\\partial t} + (\\mathbf{u}\\cdot\\nabla)\\mathbf{u}\\right) = -\\nabla p + \\mu \\nabla^2 \\mathbf{u} + \\mathbf{f}$$\nwith $\\nabla \\cdot \\mathbf{u} = 0$ (incompressibility). They govern [[viscous fluid]] motion: $\\mathbf{u}$ = velocity field, $p$ = pressure, $\\mu$ = [[dynamic viscosity]], $\\mathbf{f}$ = body forces.'],

  // ── HODGE CONJECTURE ─────────────────────────────────────────────────────

  ['Hodge Conjecture — state it.',
   'For a smooth [[complex projective variety]] $X$, every [[Hodge class]] in $H^{2k}(X, \\mathbb{Q})$ is a $\\mathbb{Q}$-linear combination of classes of [[algebraic cycles]]. Bridges [[algebraic geometry]], [[topology]], and [[complex analysis]]. (Hodge, 1950; CMI 2000)'],

  ['What is a Hodge class?',
   'A [[cohomology class]] in $H^{p,p}(X) \\cap H^{2p}(X, \\mathbb{Z})$ — living in the intersection of the [[Hodge decomposition]] and integral cohomology. The conjecture says all such classes come from geometry ([[algebraic subvarieties]]).'],

  // ── BSD CONJECTURE ────────────────────────────────────────────────────────

  ['Birch and Swinnerton-Dyer Conjecture — state it.',
   'For an [[elliptic curve]] $E$ over $\\mathbb{Q}$, the [[rank]] of $E(\\mathbb{Q})$ equals the order of vanishing of the [[L-function]] $L(E, s)$ at $s = 1$: $\\text{ord}_{s=1} L(E,s) = \\text{rank}(E(\\mathbb{Q}))$. Connects [[arithmetic]] (rational points) to [[complex analysis]] (L-functions). (Birch & Swinnerton-Dyer, 1965; CMI 2000)'],

  ['What is an elliptic curve?',
   'A smooth [[cubic curve]] over a field $k$ with a marked point, usually written $y^2 = x^3 + ax + b$ (Weierstrass form). The set of rational points $E(\\mathbb{Q})$ forms an [[abelian group]] ([[Mordell-Weil theorem]]). Its rank — the number of independent generators — is what BSD predicts.'],

  // ── POINCARÉ CONJECTURE (SOLVED) ─────────────────────────────────────────

  ['Poincaré Conjecture — statement and resolution.',
   'Every simply connected, closed [[3-manifold]] is [[homeomorphic]] to the [[3-sphere]] $S^3$. Solved by [[Grigori Perelman]] (2002–2003) using [[Ricci flow with surgery]], building on Hamilton\'s program. Perelman declined the $1M prize and the Fields Medal. (Perelman, 2002; CMI 2010 verification)'],

  ['What is Ricci flow?',
   '$$\\frac{\\partial g_{ij}}{\\partial t} = -2 R_{ij}$$\nAn [[intrinsic geometric flow]] that deforms a [[Riemannian metric]] $g$ by its [[Ricci curvature]] $R_{ij}$. Introduced by [[Richard Hamilton]] (1982) as a way to "round out" geometry. Perelman added [[surgery]] to handle singularities ([[neck pinches]]). (Hamilton, 1982)'],

  // ── CROSS-CUTTING ────────────────────────────────────────────────────────

  ['Which Millennium Problems involve L-functions?',
   '[[Riemann Hypothesis]] ($\\zeta(s)$ is an L-function) and [[Birch and Swinnerton-Dyer]] ($L(E,s)$ for elliptic curves). Both ask about zeros and vanishing orders at special values. L-functions are central to the [[Langlands program]].'],

  ['Which Millennium Problems involve PDEs or geometry?',
   '[[Navier-Stokes]] (fluid PDEs), [[Yang-Mills mass gap]] (quantum field equations), [[Poincaré Conjecture]] (solved via geometric flow), [[Hodge Conjecture]] (algebraic geometry). Four of the seven touch differential equations or geometry.'],
]

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: npx tsx scripts/seed-millennium-problems.ts your@email.com'); process.exit(1) }

  const [user] = await db.select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers).where(eq(authSchema.authUsers.email, email))
  if (!user) { console.error(`User not found: ${email}`); process.exit(1) }
  const uid = user.id

  const deckName = '🏆 Millennium Prize Problems'
  const existing = await db.select({ id: schema.srsDecks.id })
    .from(schema.srsDecks).where(and(eq(schema.srsDecks.ownerUid, uid), eq(schema.srsDecks.name, deckName)))
  if (existing[0]) { console.log(`"${deckName}" already exists — skipping.`); await pool.end(); return }

  const deckId = nanoid()
  await db.insert(schema.srsDecks).values({
    id: deckId, ownerUid: uid, name: deckName, active: true,
    description: 'Seven Clay Mathematics Institute problems ($1M each). Uses [[wikilinks]] for drill-down to definitions. Six unsolved. Sources: CMI official descriptions.',
  })

  const rows = CARDS.map(([front, back]) => {
    const id = nanoid()
    return { card: { id, deckId, ownerUid: uid, front, back, tags: ['mathematics', 'open-problems'] as string[] },
             state: { id, deckId, ownerUid: uid, srs: newSrsState() } }
  })
  await db.insert(schema.srsCards).values(rows.map(r => r.card))
  await db.insert(schema.srsCardStates).values(rows.map(r => r.state))
  console.log(`✅ "${deckName}" — ${CARDS.length} cards.`)

  // Try to assign to a maths topic
  for (const name of ['📐 Mathematics', '🔬 Physics', '📚 Mathematics & Physics']) {
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
