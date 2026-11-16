/**
 * seed-pnp-decks.ts
 *
 * Creates 29 P vs NP decks — one per conceptual level — pnp1 through pnp29.
 * Skips any deck that already exists by name.
 *
 * Usage: npx tsx scripts/seed-pnp-decks.ts your@email.com
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
const db = drizzle(pool, { schema: { ...schema, ...authSchema } })

type Card = [string, string]
interface Deck { name: string; description: string; cards: Card[] }

function newSrs(): schema.SrsObject {
  return { state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0, dueAt: new Date().toISOString(), lastReviewedAt: null }
}

const DECKS: Deck[] = [

  // ── pnp1 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp1. 🔤 Mathematical Objects',
    description: 'Alphabets, strings, languages — the raw materials of complexity theory',
    cards: [
      ['Alphabet Σ = ?', 'Finite set of symbols'],
      ['Binary alphabet?', '{0, 1}'],
      ['String over Σ?', 'Finite sequence of symbols from Σ'],
      ['|x| notation?', 'Length of string x'],
      ['ε (epsilon) string?', 'Empty string — length zero'],
      ['Σ* = ?', 'Set of all finite strings over Σ'],
      ['Language L = ?', 'Any subset of Σ*'],
      ['Decision problem = ?', 'Problem with yes/no answer — corresponds to a language'],
      ['x ∈ L means?', 'Answer to decision problem on input x is yes'],
      ['Search problem vs decision problem?', 'Search: find solution; decision: does one exist?'],
      ['Decision ≤ optimization — meaning?', 'Solving decision is no harder than solving optimization'],
    ],
  },

  // ── pnp2 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp2. ⚙️ Turing Machines',
    description: 'The formal model of computation underlying all complexity classes',
    cards: [
      ['Turing machine — 4 components?', 'Infinite tape, read/write head, state set, transition function'],
      ['TM tape?', 'Infinite sequence of cells, each holds one symbol'],
      ['TM transition function input?', '(current state, symbol under head)'],
      ['TM transition function output?', '(new state, symbol to write, head direction L/R)'],
      ['TM accepts string x?', 'Computation reaches accept state on input x'],
      ['TM rejects string x?', 'Computation reaches reject state on input x'],
      ['TM loops on x?', 'Computation never halts on input x'],
      ['Deterministic TM (DTM)?', 'Exactly one transition per (state, symbol) pair'],
      ['TM configuration?', '(current state, tape contents, head position)'],
      ['TM decides language L?', 'Accepts all x∈L, rejects all x∉L, always halts'],
      ['Church-Turing thesis?', 'Every effectively computable function is TM-computable'],
      ['Church-Turing — proven or thesis?', 'Thesis — not formally provable'],
      ['RAM model vs TM — equivalent?', 'Yes — polynomially equivalent in time'],
    ],
  },

  // ── pnp3 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp3. 🚫 Decidability',
    description: 'What can be computed at all — before asking how fast',
    cards: [
      ['Decidable language?', 'TM that always halts and decides it exists'],
      ['Recognizable language?', 'TM accepts all members; may loop on non-members'],
      ['Undecidable problem?', 'No TM decides it — ever'],
      ['Halting problem?', 'Does TM M halt on input w?'],
      ['Halting problem — decidable?', 'No — proven undecidable (Turing 1936)'],
      ['Undecidability proof technique?', 'Diagonalization'],
      ['Reduction A ≤_m B means?', 'If B decidable then A decidable'],
      ['Rice theorem?', 'Every non-trivial semantic property of TMs is undecidable'],
    ],
  },

  // ── pnp4 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp4. 📈 Asymptotic Notation',
    description: 'The language for expressing how algorithms scale',
    cards: [
      ['f = O(g) means?', 'f grows no faster than g asymptotically'],
      ['f = Ω(g) means?', 'f grows at least as fast as g asymptotically'],
      ['f = Θ(g) means?', 'f and g grow at the same asymptotic rate'],
      ['f = o(g) means?', 'f grows strictly slower than g (f/g → 0)'],
      ['O(1)?', 'Constant time'],
      ['O(log n)?', 'Logarithmic'],
      ['O(n)?', 'Linear'],
      ['O(n log n)?', 'Linearithmic — e.g. merge sort'],
      ['O(n²)?', 'Quadratic'],
      ['O(nᵏ) for fixed k?', 'Polynomial'],
      ['O(2ⁿ)?', 'Exponential'],
      ['O(n!)?', 'Factorial'],
      ['Time complexity T(n)?', 'Max steps TM uses on any input of length n'],
      ['Space complexity S(n)?', 'Max tape cells used on any input of length n'],
      ['Worst-case complexity?', 'Maximum over all inputs of length n'],
    ],
  },

  // ── pnp5 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp5. 🟢 Class P',
    description: 'The class of efficiently solvable problems',
    cards: [
      ['Class P = ?', 'Decision problems solvable in polynomial time by a DTM'],
      ['DTIME(f(n)) = ?', 'Decision problems solvable in O(f(n)) deterministic time'],
      ['P formal definition?', 'P = ⋃_{k≥0} DTIME(nᵏ)'],
      ['Polynomial time = ?', 'O(nᵏ) for some constant k independent of input'],
      ['Cobham-Edmonds thesis?', 'Polynomial time = feasibly solvable in practice'],
      ['Why polynomial = "efficient"?', 'Closed under composition; robust across hardware models'],
      ['Sorting — class?', 'P — O(n log n)'],
      ['Shortest path — class?', 'P — Dijkstra O((V+E) log V)'],
      ['Primality testing — class?', 'P — AKS 2002, O(log⁶ n)'],
      ['Linear programming — class?', 'P — ellipsoid / interior point'],
      ['Bipartite matching — class?', 'P — Hopcroft-Karp O(E√V)'],
      ['GCD — class?', 'P — Euclidean algorithm O(log n)'],
      ['Maximum flow — class?', 'P — Ford-Fulkerson variants'],
      ['AKS 2002 significance?', 'PRIMES ∈ P — resolved 30-year open problem'],
    ],
  },

  // ── pnp6 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp6. 🟡 Class NP',
    description: 'Two equivalent definitions of nondeterministic polynomial time',
    cards: [
      ['NP stands for?', 'Nondeterministic Polynomial time'],
      ['NP — verifier definition?', 'Yes-instances have poly-time-checkable certificates'],
      ['Certificate (witness)?', 'Short proof that x ∈ L'],
      ['Verifier V for L?', 'Poly-time V(x,c): x∈L ⟺ ∃c s.t. V(x,c)=1'],
      ['Certificate length in NP?', 'Polynomial in |x|'],
      ['NP — NTM definition?', 'Solvable in poly time by a nondeterministic TM'],
      ['Nondeterministic TM differs how?', 'Multiple transitions allowed per (state, symbol)'],
      ['NTM accepts x?', 'At least one computation branch accepts x'],
      ['Both NP definitions equivalent?', 'Yes — proven equivalent'],
      ['P ⊆ NP — why?', 'Any poly-time solution is itself a poly-time verifier'],
      ['co-NP = ?', 'Problems whose complements are in NP'],
      ['co-NP example?', 'TAUTOLOGY — is φ true under all variable assignments?'],
      ['NP ∩ co-NP significance?', 'Problems unlikely to be NP-complete — e.g. integer factoring'],
      ['NP ∩ co-NP ≠ P — proven?', 'No — open question'],
    ],
  },

  // ── pnp7 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp7. 📋 NP Problem Examples',
    description: 'The canonical NP problems and their decision formulations',
    cards: [
      ['SAT = ?', 'Does Boolean formula φ have a satisfying assignment?'],
      ['3-SAT = ?', 'SAT where every clause has exactly 3 literals'],
      ['CLIQUE = ?', 'Does graph G contain a clique of size k?'],
      ['INDEPENDENT SET = ?', 'Does G have an independent set of size k?'],
      ['VERTEX COVER = ?', 'Does G have a vertex cover of size k?'],
      ['HAMILTONIAN PATH = ?', 'Does G have a path visiting every vertex exactly once?'],
      ['HAMILTONIAN CYCLE = ?', 'Does G have a cycle visiting every vertex exactly once?'],
      ['TSP decision version?', 'Does G have a Hamiltonian cycle of total cost ≤ k?'],
      ['SUBSET SUM = ?', 'Does any subset of S sum to target t?'],
      ['GRAPH k-COLORING = ?', 'Can G be properly colored with k colors?'],
      ['3-COLORING — NP-complete?', 'Yes'],
      ['0-1 INTEGER PROGRAMMING?', 'NP-complete'],
      ['KNAPSACK decision version?', 'Can items with weight ≤ W achieve value ≥ V?'],
    ],
  },

  // ── pnp8 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp8. ↔️ Polynomial-Time Reductions',
    description: 'The tool for comparing problem difficulty',
    cards: [
      ['A ≤_p B (Karp reduction)?', 'Poly-time computable f: x∈A ⟺ f(x)∈B'],
      ['A ≤_p B — what it means?', 'A is no harder than B up to poly-time computation'],
      ['A ≤_p B — if B ∈ P then?', 'A ∈ P'],
      ['A ≤_p B — contrapositive?', 'If A ∉ P then B ∉ P'],
      ['≤_p transitivity?', 'A ≤_p B and B ≤_p C implies A ≤_p C'],
      ['Cook reduction vs Karp reduction?', 'Cook: oracle calls allowed; Karp: single many-one mapping'],
      ['Karp = many-one reduction?', 'Yes'],
      ['Cook = Turing reduction?', 'Yes'],
    ],
  },

  // ── pnp9 ─────────────────────────────────────────────────────────────────
  {
    name: 'pnp9. 🔴 NP-Hardness & Completeness',
    description: 'The hardest problems in NP and how they are all equivalent',
    cards: [
      ['NP-hard definition?', 'Every problem in NP poly-time reduces to it'],
      ['NP-complete = ?', 'NP-hard AND in NP'],
      ['NP-complete significance?', 'Hardest problems in NP — universal difficulty'],
      ['If any NP-complete problem ∈ P?', 'Then P = NP'],
      ['Cook-Levin theorem?', 'SAT is NP-complete'],
      ['Cook-Levin — proved by?', 'Cook 1971 (USA) and Levin 1973 (USSR) independently'],
      ['First NP-complete problem?', 'SAT — Cook-Levin theorem 1971'],
      ['Karp 1972 contribution?', '21 NP-complete problems via reduction chains from SAT'],
      ['3-SAT ≤_p CLIQUE?', 'Yes — variable/clause gadget (Karp 1972)'],
      ['CLIQUE ≤_p INDEPENDENT SET?', 'Yes — complement graph'],
      ['VERTEX COVER ↔ INDEPENDENT SET?', 'S is vertex cover ⟺ V\\S is independent set'],
      ['3-SAT ≤_p HAMILTONIAN PATH?', 'Yes — variable/clause gadgets'],
      ['HAM-CYCLE ≤_p TSP?', 'Yes — unit-cost complete graph'],
      ['SAT ≤_p 3-SAT?', 'Yes — split long clauses into 3-literal chains'],
      ['All NP-complete problems poly-equivalent?', 'Yes — every pair reduces to the other'],
    ],
  },

  // ── pnp10 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp10. ❓ The P vs NP Question',
    description: 'What is being asked, what each answer means, and current status',
    cards: [
      ['P vs NP question?', 'Is every NP problem solvable in polynomial time?'],
      ['Formally: P vs NP?', 'Does P = NP?'],
      ['P = NP would imply?', 'All NP problems tractable; cryptography collapses; math automation'],
      ['P ≠ NP would imply?', 'NP-complete problems inherently intractable; crypto foundations hold'],
      ['P vs NP — current status?', 'Open — unresolved'],
      ['Millennium Prize for P vs NP?', '$1,000,000 — Clay Mathematics Institute 2000'],
      ['Expert consensus?', 'P ≠ NP — overwhelming belief, not proven'],
      ['Cook 1971 paper title?', '"The complexity of theorem-proving procedures"'],
      ['Why hard to resolve?', 'Three known barriers block most proof techniques'],
      ['Ladner theorem 1975?', 'If P≠NP there exist NP-intermediate problems'],
      ['NP-intermediate candidate?', 'Integer factoring, graph isomorphism'],
    ],
  },

  // ── pnp11 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp11. 🔭 Barrier 1 — Relativization',
    description: 'Why diagonalization cannot resolve P vs NP',
    cards: [
      ['Relativization barrier?', 'Standard proof techniques work relative to any oracle'],
      ['Oracle machine?', 'TM with black-box free single-step access to a language'],
      ['Baker-Gill-Solovay (BGS) 1975?', 'Oracle A: Pᴬ=NPᴬ; Oracle B: Pᴮ≠NPᴮ'],
      ['BGS — implication?', 'Diagonalization alone cannot separate P from NP'],
      ['BGS — why it matters?', 'Most classical computability proofs relativize — they are ruled out'],
      ['Relativizing proof?', 'Proof that works unchanged when all machines get oracle access'],
    ],
  },

  // ── pnp12 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp12. 🌿 Barrier 2 — Natural Proofs',
    description: 'Why most circuit lower bound techniques cannot work',
    cards: [
      ['Natural proofs barrier?', 'Razborov-Rudich 1994 — most lower bound proofs imply crypto breaks'],
      ['Natural proof (formal)?', 'Proof using a constructive and large property of Boolean functions'],
      ['Constructive property?', 'Membership computable in polynomial time'],
      ['Large property?', 'Holds for ≥ 2^{-poly(n)} fraction of all functions'],
      ['Razborov-Rudich assumption?', 'Pseudorandom functions exist (standard crypto assumption)'],
      ['Natural proofs implication?', 'No natural proof can show NP ⊄ P/poly if pseudorandom functions exist'],
      ['Why this is a barrier?', 'Almost all known circuit lower bound arguments are natural'],
    ],
  },

  // ── pnp13 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp13. 🧮 Barrier 3 — Algebrization',
    description: 'Why algebraic extensions of relativization also fail',
    cards: [
      ['Algebrization barrier?', 'Aaronson-Wigderson 2009 — algebraic oracle extensions also blocked'],
      ['Algebrization extends?', 'Relativization to algebraic extensions of oracle languages'],
      ['Algebrizing proof?', 'Proof that works for algebraic oracle extensions'],
      ['Algebrization shows?', 'Algebraic techniques cannot resolve P vs NP either'],
      ['Three barriers combined imply?', 'Any proof must be non-relativizing, non-natural, AND non-algebrizing'],
      ['GCT — why promising?', 'Uses invariant theory — believed to avoid all three barriers'],
    ],
  },

  // ── pnp14 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp14. 🌌 PSPACE, EXP & Hierarchy Theorems',
    description: 'Beyond NP — larger complexity classes and what is proven about them',
    cards: [
      ['PSPACE = ?', 'Problems solvable using polynomial space (any amount of time)'],
      ['TQBF = ?', 'True Quantified Boolean Formula — ∀x∃y...φ(x,y,...)'],
      ['TQBF — class?', 'PSPACE-complete'],
      ['P ⊆ NP ⊆ PSPACE — proven?', 'Yes'],
      ['P ≠ PSPACE — proven?', 'Yes — space hierarchy theorem'],
      ['PSPACE ⊆ EXP — proven?', 'Yes'],
      ['EXP = ?', 'Problems solvable in 2^{poly(n)} time'],
      ['P ≠ EXP — proven?', 'Yes — time hierarchy theorem'],
      ['Time hierarchy theorem?', 'Strictly more time gives strictly more power'],
      ['Space hierarchy theorem?', 'Strictly more space gives strictly more power'],
      ['Savitch theorem?', 'NSPACE(f) ⊆ DSPACE(f²)'],
      ['NL = ?', 'Nondeterministic logspace'],
      ['NL-complete example?', 'ST-CONNECTIVITY — directed graph reachability'],
      ['L ⊆ NL ⊆ P — proven?', 'Yes'],
      ['Immerman-Szelepcsényi theorem?', 'NL = co-NL — nondeterministic logspace closed under complement'],
    ],
  },

  // ── pnp15 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp15. 🏔️ Polynomial Hierarchy',
    description: 'The tower of classes above NP built with alternating quantifiers',
    cards: [
      ['Polynomial hierarchy PH = ?', 'Tower built above NP with alternating quantifiers'],
      ['Σ_p^0 = Π_p^0 = ?', 'P'],
      ['Σ_p^1 = ?', 'NP'],
      ['Π_p^1 = ?', 'co-NP'],
      ['Σ_p^2 = ?', 'NP^{NP} — NP with NP oracle'],
      ['Σ_p^{k+1} = ?', 'NP^{Σ_p^k}'],
      ['PH = ?', '⋃_k Σ_p^k'],
      ['PH ⊆ PSPACE — proven?', 'Yes'],
      ['PH collapses if?', 'Σ_p^k = Π_p^k for some k — all levels collapse'],
      ['P = NP collapses PH to?', 'P — immediate total collapse'],
      ['PH believed infinite?', 'Yes — no collapse expected'],
    ],
  },

  // ── pnp16 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp16. 🎲 Randomized Complexity',
    description: 'Probabilistic algorithms and where randomness fits in the landscape',
    cards: [
      ['BPP = ?', 'Bounded-error probabilistic polynomial time'],
      ['BPP error bound?', '≤ 1/3 (amplifiable by repetition to exponentially small)'],
      ['P ⊆ BPP — why?', 'Deterministic = probabilistic with zero error'],
      ['BPP ⊆ Σ_p^2 — proved by?', 'Sipser-Gács-Lautemann theorem'],
      ['Derandomization conjecture?', 'P = BPP — widely believed, unproven'],
      ['RP = ?', 'Randomized poly time — no false positives, ≤1/2 false negatives'],
      ['co-RP = ?', 'Complement of RP — no false negatives'],
      ['ZPP = RP ∩ co-RP = ?', 'Zero-error probabilistic poly time'],
      ['Las Vegas vs Monte Carlo?', 'Las Vegas: always correct, random runtime; Monte Carlo: always fast, may err'],
    ],
  },

  // ── pnp17 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp17. #️⃣ Counting Complexity — #P',
    description: 'Counting solutions — harder than finding one',
    cards: [
      ['#P = ?', 'Count number of accepting computation paths of NP machine'],
      ['#SAT = ?', 'Count satisfying assignments of Boolean formula φ'],
      ['#P-complete examples?', '#SAT, permanent of 0-1 matrix'],
      ['Valiant 1979?', 'Introduced #P; proved permanent is #P-complete'],
      ['Permanent vs determinant — complexity?', 'Determinant ∈ P; permanent is #P-complete'],
      ['Toda theorem 1991?', 'PH ⊆ P^{#P} — counting harder than polynomial hierarchy'],
      ['Toda significance?', 'One #P oracle collapses the entire polynomial hierarchy'],
      ['Approximate counting ∈ BPP?', 'Yes for DNF (FPRAS exists) — but exact counting is #P-hard'],
    ],
  },

  // ── pnp18 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp18. ⚡ Circuit Complexity',
    description: 'Boolean circuits as a non-uniform model — and the struggle for lower bounds',
    cards: [
      ['Boolean circuit?', 'DAG of AND, OR, NOT gates computing a Boolean function'],
      ['Circuit size = ?', 'Number of gates'],
      ['Circuit depth = ?', 'Longest path from input to output'],
      ['P/poly = ?', 'Problems solvable by polynomial-size circuit families'],
      ['P ⊆ P/poly?', 'Yes'],
      ['NP ⊆ P/poly would imply?', 'PH collapses to Σ_p^2 (Karp-Lipton theorem)'],
      ['Karp-Lipton theorem?', 'If SAT ∈ P/poly then PH = Σ_p^2'],
      ['NC = ?', 'Poly-size, polylog-depth circuits — efficiently parallelizable'],
      ['NC ⊆ P — proven?', 'Yes'],
      ['AC^0 = ?', 'Constant-depth, poly-size circuits with unbounded fan-in AND/OR'],
      ['PARITY ∉ AC^0 — proved by?', 'Furst-Saxe-Sipser 1984; tight: Håstad 1986'],
      ['Håstad switching lemma?', 'Random restrictions simplify AC^0 circuits — key to lower bound'],
      ['Monotone circuit lower bounds?', 'CLIQUE needs exponential monotone circuits (Razborov 1985)'],
      ['Circuit lower bound goal?', 'Prove NP functions need superpolynomial circuits'],
      ['Why circuit lower bounds stall?', 'Natural proofs barrier blocks most approaches'],
    ],
  },

  // ── pnp19 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp19. 💬 Interactive Proofs',
    description: 'What you can verify by talking to an all-powerful prover',
    cards: [
      ['Interactive proof system?', 'Computationally unbounded prover + poly-time probabilistic verifier'],
      ['IP = ?', 'Class of problems with interactive proof systems'],
      ['IP = PSPACE — proved by?', 'Shamir 1992'],
      ['IP = PSPACE significance?', 'Interaction exponentially more powerful than static proofs'],
      ['AM = ?', 'Arthur-Merlin — public-coin interactive proofs'],
      ['GNI ∈ AM — significance?', 'Graph non-isomorphism has interactive proof (Goldwasser-Sipser)'],
      ['MIP = ?', 'Multiple non-communicating provers'],
      ['MIP* = ?', 'Multiple provers sharing quantum entanglement'],
      ['MIP* = RE — proved when?', 'Ji et al. 2020'],
      ['MIP* = RE significance?', 'Entangled provers can verify undecidable problems'],
    ],
  },

  // ── pnp20 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp20. ✅ PCP Theorem',
    description: 'Every NP proof can be checked with constant queries — and what that implies',
    cards: [
      ['PCP = ?', 'Probabilistically Checkable Proof'],
      ['PCP theorem?', 'NP = PCP(log n, 1)'],
      ['PCP(r, q) means?', 'r random bits, q queries to verify a proof'],
      ['PCP theorem proved by?', 'Arora-Safra, Arora-Lund-Motwani-Sudan-Szegedy 1992–1998'],
      ['PCP main corollary?', 'NP-hard optimization problems are hard to approximate'],
      ['MAX-3SAT inapproximable within?', '7/8 + ε — PCP-optimal (random gives 7/8)'],
      ['PCP — why revolutionary?', 'Connects proof verification to approximability of optimization'],
    ],
  },

  // ── pnp21 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp21. 📐 Hardness of Approximation',
    description: 'When exact solutions are NP-hard, how close can you get in poly time?',
    cards: [
      ['α-approximation algorithm?', 'Poly-time algorithm with solution within factor α of optimal'],
      ['PTAS = ?', 'Poly-time approximation scheme — (1+ε)-approx for any ε > 0'],
      ['FPTAS = ?', 'Fully polynomial PTAS — poly in both n and 1/ε'],
      ['APX = ?', 'Problems with constant-factor polynomial-time approximation'],
      ['P ⊆ FPTAS ⊆ PTAS ⊆ APX — correct?', 'Yes — containment chain'],
      ['TSP metric approximable within?', '3/2 — Christofides 1976'],
      ['TSP general — approximable?', 'Inapproximable to any constant unless P=NP'],
      ['MAX-CLIQUE approximable?', 'n^{1-ε}-inapproximable for any ε>0 unless P=NP'],
      ['VERTEX COVER best known?', '2-approximation — trivially (take both endpoints of a matching)'],
      ['Knapsack has FPTAS?', 'Yes — dynamic programming rounded'],
      ['BIN PACKING has PTAS?', 'Yes'],
    ],
  },

  // ── pnp22 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp22. 🎮 Unique Games Conjecture',
    description: 'Khot 2002 — the conjecture reshaping our understanding of approximability',
    cards: [
      ['Unique Games Conjecture (UGC)?', 'Khot 2002 — unique label cover is NP-hard to approximate'],
      ['UGC stated by?', 'Subhash Khot 2002'],
      ['UGC — status?', 'Open — major unresolved conjecture'],
      ['UGC implies for VERTEX COVER?', '(2-ε)-approximation is NP-hard for any ε > 0'],
      ['UGC implies for MAX-CUT?', 'GW 0.878 algorithm is optimal — cannot do better'],
      ['Goemans-Williamson algorithm?', 'SDP rounding → 0.878-approximation for MAX-CUT'],
      ['SDP = ?', 'Semidefinite programming — convex relaxation technique'],
      ['UGC — why important?', 'Gives tight inapproximability for many problems simultaneously'],
      ['2-2 Games Conjecture?', 'Weaker variant; proved by DKKMS 2018'],
    ],
  },

  // ── pnp23 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp23. 🔷 Geometric Complexity Theory',
    description: 'Mulmuley-Sohoni 2001 — algebraic geometry attacks P vs NP',
    cards: [
      ['GCT = ?', 'Geometric Complexity Theory'],
      ['GCT founded by?', 'Ketan Mulmuley & Milind Sohoni 2001'],
      ['GCT approach?', 'Algebraic geometry + representation theory of GLₙ'],
      ['GCT central problem?', 'Permanent vs determinant — algebraic analog of P vs NP'],
      ["Valiant's VP = ?", 'Polynomial families computable by poly-size algebraic circuits'],
      ["Valiant's VNP = ?", 'Polynomial families with exponential sum-of-products definition'],
      ['VP ≠ VNP would imply?', 'Permanent needs superpolynomial algebraic circuits'],
      ['GCT obstruction?', 'Occurrence obstruction in representation theory blocking the permanent'],
      ['GCT — why avoids barriers?', 'Uses invariant theory — not diagonalization or natural proofs'],
      ['GCT status?', 'Long-term program — partial results, no decisive breakthrough yet'],
    ],
  },

  // ── pnp24 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp24. ⚛️ Quantum Complexity',
    description: 'Where quantum computation sits relative to P and NP',
    cards: [
      ['BQP = ?', 'Bounded-error quantum polynomial time'],
      ['P ⊆ BQP — why?', 'Classical computation is a special case of quantum'],
      ["Shor's algorithm — class?", 'Integer factoring ∈ BQP'],
      ['Factoring — classical class?', 'NP ∩ co-NP; not known to be in P'],
      ['BQP vs NP — relationship?', 'Unknown — neither likely contains the other'],
      ['P ⊆ BQP ⊆ PSPACE — proven?', 'Yes'],
      ['Quantum speedup for NP-complete?', "Grover gives O(√N) — quadratic, not polynomial"],
      ["Grover's algorithm?", 'Unstructured search in O(√N) quantum steps'],
      ['Quantum cannot solve NP-complete in poly time?', 'Believed true — no algorithm known'],
      ['BQPSPACE = PSPACE?', 'Yes — quantum space equals classical space'],
    ],
  },

  // ── pnp25 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp25. 🔐 Cryptography Connection',
    description: 'Why P≠NP is the bedrock assumption of all modern cryptography',
    cards: [
      ['One-way function (OWF)?', 'Easy to compute, hard to invert on random inputs'],
      ['OWF necessary condition?', 'P ≠ NP — required for OWFs to exist'],
      ['OWF sufficient for P≠NP?', 'No — P≠NP is weaker (worst-case not average-case)'],
      ['P = NP implies?', 'No one-way functions — all symmetric and asymmetric crypto breaks'],
      ['OWF → pseudorandom generators?', 'Yes — HILL theorem'],
      ['OWF → private-key crypto?', 'Yes — stream ciphers, MACs, symmetric encryption'],
      ['Public-key crypto requires?', 'Trapdoor OWF — strictly stronger than basic OWF'],
      ['RSA hardness based on?', 'Integer factoring — believed hard classically'],
      ['Discrete log — hard classically?', 'Believed yes; quantum Shor breaks it'],
      ['Crypto ≠ P≠NP directly because?', 'Crypto needs average-case hardness; NP-hardness is worst-case'],
    ],
  },

  // ── pnp26 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp26. 📜 Descriptive Complexity',
    description: 'Complexity classes characterized by logical expressibility',
    cards: [
      ['Descriptive complexity?', 'Characterize complexity classes by logic expressibility'],
      ["Fagin's theorem 1974?", 'NP = ∃SO — existential second-order logic'],
      ['P in descriptive complexity?', 'FO + LFP (least fixed point) on ordered structures'],
      ['Immerman-Vardi theorem?', 'P = FO(LFP) on ordered structures'],
      ['PSPACE in logic?', 'FO(PFP) — partial fixed point logic'],
      ['L in descriptive complexity?', 'FO(DTC) — deterministic transitive closure'],
      ['NL in descriptive complexity?', 'FO(TC) — transitive closure logic'],
      ["Fagin's theorem significance?", 'NP has a purely logical, machine-free characterization'],
    ],
  },

  // ── pnp27 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp27. 🧑‍🔬 Key People',
    description: 'Who proved what — the intellectual lineage of complexity theory',
    cards: [
      ['Cook 1971?', 'Defined NP-completeness; proved SAT NP-complete'],
      ['Levin 1973?', 'Independently discovered NP-completeness (USSR)'],
      ['Karp 1972?', '21 NP-complete problems; established reduction framework'],
      ['Baker, Gill & Solovay 1975?', 'Relativization barrier — oracles A,B splitting P vs NP'],
      ['Razborov & Rudich 1994?', 'Natural proofs barrier'],
      ['Aaronson & Wigderson 2009?', 'Algebrization barrier'],
      ['Arora, Safra et al. 1992–1998?', 'PCP theorem'],
      ['Khot 2002?', 'Unique Games Conjecture'],
      ['Mulmuley & Sohoni 2001?', 'Geometric Complexity Theory'],
      ['Valiant 1979?', '#P-completeness of permanent; introduced #P'],
      ['Håstad 1986?', 'AC^0 lower bound via switching lemma'],
      ['Shamir 1992?', 'IP = PSPACE'],
      ['Toda 1991?', 'PH ⊆ P^{#P}'],
      ['Fagin 1974?', 'NP = existential second-order logic'],
      ['Agrawal, Kayal & Saxena 2002?', 'PRIMES ∈ P — AKS algorithm'],
      ['Christofides 1976?', '3/2-approximation for metric TSP'],
      ['Goemans & Williamson 1994?', '0.878-approximation for MAX-CUT via SDP'],
      ['Ji et al. 2020?', 'MIP* = RE — entangled provers verify undecidable problems'],
    ],
  },

  // ── pnp28 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp28. ⚡ Key Theorems Quick-Fire',
    description: 'The landmark proven results — cold recall',
    cards: [
      ['Time hierarchy theorem consequence?', 'P ⊊ EXP — strict containment proven'],
      ['Space hierarchy theorem consequence?', 'L ⊊ PSPACE — strict'],
      ['Ladner theorem 1975?', 'If P≠NP there exist NP-intermediate problems'],
      ['NP-intermediate candidate examples?', 'Integer factoring, graph isomorphism'],
      ['Graph isomorphism — class?', 'NP ∩ co-AM; not known P or NP-complete'],
      ['Karp-Lipton theorem?', 'NP ⊆ P/poly implies PH = Σ_p^2'],
      ['Sipser-Gács-Lautemann?', 'BPP ⊆ Σ_p^2 — randomness inside polynomial hierarchy'],
      ['Immerman-Szelepcsényi?', 'NL = co-NL'],
      ['Toda theorem?', 'PH ⊆ P^{#P}'],
      ['IP = PSPACE?', 'Yes — Shamir 1992'],
      ['MIP* = RE?', 'Yes — Ji et al. 2020'],
      ['AC^0 cannot compute?', 'PARITY — Håstad 1986'],
    ],
  },

  // ── pnp29 ────────────────────────────────────────────────────────────────
  {
    name: 'pnp29. 🌲 Connections to Predict & Forestry',
    description: 'Why complexity theory is directly behind every algorithm in the data platform',
    cards: [
      ['Forest plot optimal sampling — hardness?', 'NP-hard — maximum coverage / set cover variant'],
      ['Set cover decision problem — class?', 'NP-complete'],
      ['Set cover best approximation?', 'ln(n)-approximation via greedy — optimal unless P=NP'],
      ['LiDAR tile coverage optimization?', 'NP-hard set cover — greedy ln(n)-approx used'],
      ['k-means clustering — exact solution?', 'NP-hard — Lloyd heuristic used in practice'],
      ['dbt DAG dependency resolution?', 'Topological sort — O(V+E) — in P'],
      ['SQL query optimization — general?', 'NP-hard — heuristic join ordering used'],
      ['Optimal forest road routing?', 'NP-hard — Steiner tree variant'],
      ['Feature selection for LiDAR models?', 'Optimal subset selection — NP-hard (2ⁿ search space)'],
      ['Why approximation algorithms matter?', 'Exact solutions to spatial optimization are intractable — approximation is the only poly-time option'],
      ['Why P≠NP matters for predict auth?', 'TLS, signed tokens — all rest on hardness assumptions that collapse if P=NP'],
      ['Clustering spatial plots — class?', 'NP-hard — spatial k-median variant'],
    ],
  },
]

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx scripts/seed-pnp-decks.ts your@email.com')
    process.exit(1)
  }

  const [user] = await db
    .select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers)
    .where(eq(authSchema.authUsers.email, email))

  if (!user) { console.error(`No user: ${email}`); process.exit(1) }
  const uid = user.id
  console.log(`\nUser: ${email} (${uid})\n`)

  let totalDecks = 0, totalCards = 0, skipped = 0

  for (const deck of DECKS) {
    const existing = await db
      .select({ id: schema.srsDecks.id })
      .from(schema.srsDecks)
      .where(and(eq(schema.srsDecks.ownerUid, uid), eq(schema.srsDecks.name, deck.name)))

    if (existing.length > 0) {
      console.log(`  ⏭  Skipping "${deck.name}"`)
      skipped++
      continue
    }

    const [newDeck] = await db
      .insert(schema.srsDecks)
      .values({ id: nanoid(), ownerUid: uid, name: deck.name, description: deck.description })
      .returning({ id: schema.srsDecks.id })

    const deckId = newDeck.id
    let cardCount = 0

    for (const [front, back] of deck.cards) {
      const cardId = nanoid()
      await db.insert(schema.srsCards).values({ id: cardId, ownerUid: uid, deckId, front, back })
      await db.insert(schema.srsCardStates).values({ id: cardId, ownerUid: uid, deckId, srs: newSrs() })
      cardCount++
    }

    console.log(`  ✓  "${deck.name}" — ${cardCount} cards`)
    totalDecks++
    totalCards += cardCount
  }

  console.log(`\n✅  Done — ${totalDecks} decks created, ${totalCards} cards inserted, ${skipped} skipped\n`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
