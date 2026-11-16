import { gamma } from 'mathjs'

export type FormulaCategory = 'probability' | 'calculus' | 'trig' | 'physics' | 'number'
export type PlotMode = '2d' | '3d'

export interface FormulaParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export interface FormulaTrace {
  x?: number[]
  y?: number[] | (number | null)[]
  z?: number[][] | number[]
  type: string
  mode?: string
  name?: string
  line?: Record<string, unknown>
  marker?: Record<string, unknown>
  fill?: string
  fillcolor?: string
  colorscale?: string
  opacity?: number
  showscale?: boolean
}

export interface FormulaResult {
  traces: FormulaTrace[]
  xLabel: string
  yLabel: string
  zLabel?: string
}

export interface Formula {
  id: string
  name: string
  category: FormulaCategory
  mode: PlotMode
  description: string
  formulaText: string
  params: FormulaParam[]
  generate: (params: Record<string, number>) => FormulaResult
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function linspace(start: number, end: number, n: number): number[] {
  if (n === 1) return [start]
  const step = (end - start) / (n - 1)
  return Array.from({ length: n }, (_, i) => start + i * step)
}

function meshgrid(xs: number[], ys: number[]): { X: number[][]; Y: number[][] } {
  const X = ys.map(() => [...xs])
  const Y = ys.map(y => xs.map(() => y))
  return { X, Y }
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function combinations(n: number, k: number): number {
  if (k > n) return 0
  if (k === 0 || k === n) return 1
  k = Math.min(k, n - k)
  let result = 1
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1)
  }
  return result
}

function betaFn(a: number, b: number): number {
  return (gamma(a) as number) * (gamma(b) as number) / (gamma(a + b) as number)
}

const INDIGO = '#6366f1'
const VIOLET = '#8b5cf6'
const EMERALD = '#10b981'
const AMBER = '#f59e0b'
const ROSE = '#f43f5e'

// suppress unused warning — meshgrid is defined for completeness
void meshgrid

// ── Formula definitions ───────────────────────────────────────────────────────

export const FORMULAS: Formula[] = [
  // ── PROBABILITY ──────────────────────────────────────────────────────────

  {
    id: 'normal-dist',
    name: 'Normal Distribution',
    category: 'probability',
    mode: '2d',
    description: 'The bell curve — the most fundamental continuous probability distribution.',
    formulaText: 'f(x) = 1/(σ√(2π)) · e^(−(x−μ)²/2σ²)',
    params: [
      { key: 'mu',    label: 'μ (mean)',    min: -5,  max: 5,  step: 0.1, default: 0 },
      { key: 'sigma', label: 'σ (std dev)', min: 0.1, max: 5,  step: 0.1, default: 1 },
    ],
    generate(params) {
      const { mu, sigma } = params
      const x = linspace(mu - 4 * sigma, mu + 4 * sigma, 400)
      const y = x.map(xi => (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xi - mu) / sigma) ** 2))
      return {
        traces: [
          { x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: INDIGO, width: 2.5 } },
          {
            x: [...x, ...x.slice().reverse()],
            y: [...y, ...y.map(() => 0)],
            type: 'scatter', mode: 'lines', fill: 'toself',
            fillcolor: 'rgba(99,102,241,0.15)', line: { width: 0 }, name: 'area',
          },
        ],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'beta-dist',
    name: 'Beta Distribution',
    category: 'probability',
    mode: '2d',
    description: 'A flexible distribution on [0,1] used for modelling proportions and probabilities.',
    formulaText: 'f(x;α,β) = x^(α−1)(1−x)^(β−1) / B(α,β)',
    params: [
      { key: 'alpha', label: 'α (shape)', min: 0.5, max: 10, step: 0.1, default: 2 },
      { key: 'beta',  label: 'β (shape)', min: 0.5, max: 10, step: 0.1, default: 5 },
    ],
    generate(params) {
      const { alpha, beta } = params
      const B = betaFn(alpha, beta)
      const x = linspace(0.001, 0.999, 400)
      const y = x.map(xi => {
        if (xi <= 0 || xi >= 1) return 0
        const v = Math.pow(xi, alpha - 1) * Math.pow(1 - xi, beta - 1) / B
        return isFinite(v) ? v : 0
      })
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: VIOLET, width: 2.5 } }],
        xLabel: 'x (0 to 1)', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'combinations',
    name: 'Combinations — n choose k',
    category: 'probability',
    mode: '2d',
    description: 'The binomial coefficient — number of ways to choose k items from n without replacement.',
    formulaText: 'C(n,k) = n! / (k! · (n−k)!)',
    params: [
      { key: 'n', label: 'n (total items)', min: 1, max: 20, step: 1, default: 10 },
    ],
    generate(params) {
      const n = Math.floor(params.n)
      const ks = Array.from({ length: n + 1 }, (_, i) => i)
      const c = ks.map(ki => combinations(n, ki))
      return {
        traces: [{ x: ks, y: c, type: 'bar', name: 'C(n,k)', marker: { color: VIOLET, opacity: 0.85 } }],
        xLabel: 'k', yLabel: 'C(n, k)',
      }
    },
  },

  {
    id: 'bernoulli-dist',
    name: 'Bernoulli Distribution',
    category: 'probability',
    mode: '2d',
    description: 'The simplest discrete distribution — a single trial with probability p of success. Foundation of the Binomial.',
    formulaText: 'P(X=k; p) = p^k · (1−p)^(1−k),   k ∈ {0, 1}',
    params: [
      { key: 'p', label: 'p (success probability)', min: 0.01, max: 0.99, step: 0.01, default: 0.5 },
    ],
    generate(params) {
      const { p } = params
      const q = 1 - p
      const mean = p
      const variance = p * q
      return {
        traces: [
          {
            x: [0, 1],
            y: [q, p],
            type: 'bar',
            name: 'P(X=k)',
            marker: {
              color: [INDIGO, ROSE],
              opacity: 0.85,
            },
            text: [`P(0) = ${q.toFixed(3)}`, `P(1) = ${p.toFixed(3)}`],
            textposition: 'outside',
          },
          // CDF step line (same axis — both PMF and CDF live on [0,1])
          {
            x: [-0.5, 0, 0, 1, 1, 1.5],
            y: [0, 0, q, q, 1, 1],
            type: 'scatter',
            mode: 'lines',
            name: `CDF   μ=${mean.toFixed(2)}  σ²=${variance.toFixed(3)}`,
            line: { color: EMERALD, width: 2, dash: 'dash' },
          },
        ],
        xLabel: 'k  (0 = failure, 1 = success)',
        yLabel: 'P(X = k)',
      }
    },
  },

  {
    id: 'binomial-dist',
    name: 'Binomial Distribution',
    category: 'probability',
    mode: '2d',
    description: 'Probability of k successes in n independent Bernoulli trials.',
    formulaText: 'P(k;n,p) = C(n,k) · p^k · (1−p)^(n−k)',
    params: [
      { key: 'n', label: 'n (trials)',      min: 1,    max: 50,   step: 1,    default: 20  },
      { key: 'p', label: 'p (probability)', min: 0.01, max: 0.99, step: 0.01, default: 0.5 },
    ],
    generate(params) {
      const { n, p } = params
      const k = Array.from({ length: Math.floor(n) + 1 }, (_, i) => i)
      const prob = k.map(ki =>
        combinations(Math.floor(n), ki) * Math.pow(p, ki) * Math.pow(1 - p, Math.floor(n) - ki)
      )
      return {
        traces: [{ x: k, y: prob, type: 'bar', name: 'P(k)', marker: { color: EMERALD, opacity: 0.8 } }],
        xLabel: 'k', yLabel: 'P(k)',
      }
    },
  },

  {
    id: 'poisson-dist',
    name: 'Poisson Distribution',
    category: 'probability',
    mode: '2d',
    description: 'Probability of k events in a fixed interval given average rate λ.',
    formulaText: 'P(k;λ) = e^(−λ) · λ^k / k!',
    params: [
      { key: 'lambda', label: 'λ (rate)', min: 0.1, max: 20, step: 0.1, default: 3 },
    ],
    generate(params) {
      const { lambda } = params
      const maxK = Math.max(20, Math.ceil(lambda + 4 * Math.sqrt(lambda)))
      const k = Array.from({ length: maxK + 1 }, (_, i) => i)
      const prob = k.map(ki => Math.exp(-lambda) * Math.pow(lambda, ki) / factorial(ki))
      return {
        traces: [{ x: k, y: prob, type: 'bar', name: 'P(k)', marker: { color: AMBER, opacity: 0.8 } }],
        xLabel: 'k', yLabel: 'P(k)',
      }
    },
  },

  {
    id: 'exponential-dist',
    name: 'Exponential Distribution',
    category: 'probability',
    mode: '2d',
    description: 'Time between events in a Poisson process; memoryless continuous distribution.',
    formulaText: 'f(x;λ) = λ · e^(−λx), x ≥ 0',
    params: [
      { key: 'lambda', label: 'λ (rate)', min: 0.1, max: 5, step: 0.1, default: 1 },
    ],
    generate(params) {
      const { lambda } = params
      const x = linspace(0, 6 / lambda, 400)
      const y = x.map(xi => lambda * Math.exp(-lambda * xi))
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: ROSE, width: 2.5 } }],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'chi-squared-dist',
    name: 'Chi-Squared Distribution',
    category: 'probability',
    mode: '2d',
    description: 'Sum of k squared standard normals; used in hypothesis testing.',
    formulaText: 'f(x;k) = x^(k/2−1) · e^(−x/2) / (2^(k/2) · Γ(k/2))',
    params: [
      { key: 'k', label: 'k (degrees of freedom)', min: 1, max: 20, step: 1, default: 3 },
    ],
    generate(params) {
      const k = params.k
      const xMax = Math.max(20, k + 5 * Math.sqrt(2 * k))
      const x = linspace(0.01, xMax, 400)
      const denom = Math.pow(2, k / 2) * (gamma(k / 2) as number)
      const y = x.map(xi => {
        const v = Math.pow(xi, k / 2 - 1) * Math.exp(-xi / 2) / denom
        return isFinite(v) ? v : 0
      })
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: INDIGO, width: 2.5 } }],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'student-t-dist',
    name: "Student's t-Distribution",
    category: 'probability',
    mode: '2d',
    description: "Heavier-tailed than normal; converges to N(0,1) as ν → ∞. Key for small-sample inference.",
    formulaText: 'f(t;ν) = Γ((ν+1)/2) / (√(νπ)·Γ(ν/2)) · (1 + t²/ν)^(−(ν+1)/2)',
    params: [
      { key: 'nu', label: 'ν (degrees of freedom)', min: 1, max: 30, step: 1, default: 3 },
    ],
    generate(params) {
      const { nu } = params
      const x = linspace(-5, 5, 400)
      const coeff = (gamma((nu + 1) / 2) as number) / (Math.sqrt(nu * Math.PI) * (gamma(nu / 2) as number))
      const yt = x.map(xi => coeff * Math.pow(1 + xi * xi / nu, -(nu + 1) / 2))
      const yn = x.map(xi => Math.exp(-xi * xi / 2) / Math.sqrt(2 * Math.PI))
      return {
        traces: [
          { x, y: yt, type: 'scatter', mode: 'lines', name: `t(ν=${nu})`,      line: { color: VIOLET, width: 2.5 } },
          { x, y: yn, type: 'scatter', mode: 'lines', name: 'Normal(0,1)', line: { color: INDIGO, width: 1.5, dash: 'dash' } },
        ],
        xLabel: 't', yLabel: 'f(t)',
      }
    },
  },

  {
    id: 'lognormal-dist',
    name: 'Log-Normal Distribution',
    category: 'probability',
    mode: '2d',
    description: 'A variable whose logarithm is normally distributed; right-skewed, always positive.',
    formulaText: 'f(x;μ,σ) = 1/(xσ√(2π)) · e^(−(ln x − μ)²/2σ²)',
    params: [
      { key: 'mu',    label: 'μ (log mean)', min: -2,  max: 2,  step: 0.1, default: 0   },
      { key: 'sigma', label: 'σ (log std)',  min: 0.1, max: 2,  step: 0.1, default: 0.5 },
    ],
    generate(params) {
      const { mu, sigma } = params
      const xMax = Math.exp(mu + 4 * sigma)
      const x = linspace(0.001, xMax, 400)
      const y = x.map(xi =>
        (1 / (xi * sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((Math.log(xi) - mu) / sigma) ** 2)
      )
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: EMERALD, width: 2.5 } }],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'gamma-dist',
    name: 'Gamma Distribution',
    category: 'probability',
    mode: '2d',
    description: 'Generalises the exponential distribution; models waiting times for k events.',
    formulaText: 'f(x;k,θ) = x^(k−1) · e^(−x/θ) / (θ^k · Γ(k))',
    params: [
      { key: 'k',     label: 'k (shape)',  min: 0.5, max: 10, step: 0.1, default: 2 },
      { key: 'theta', label: 'θ (scale)',  min: 0.1, max: 5,  step: 0.1, default: 1 },
    ],
    generate(params) {
      const { k, theta } = params
      const xMax = k * theta + 5 * Math.sqrt(k) * theta
      const x = linspace(0.001, xMax, 400)
      const denom = Math.pow(theta, k) * (gamma(k) as number)
      const y = x.map(xi => {
        const v = Math.pow(xi, k - 1) * Math.exp(-xi / theta) / denom
        return isFinite(v) ? v : 0
      })
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: AMBER, width: 2.5 } }],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'bayes-update',
    name: 'Bayesian Posterior Update',
    category: 'probability',
    mode: '2d',
    description: 'Gaussian conjugate update: how new data shifts a prior belief to a posterior.',
    formulaText: 'P(θ|D) ∝ P(D|θ) · P(θ)   [Gaussian conjugate]',
    params: [
      { key: 'mu0',  label: 'Prior μ₀',       min: -3,  max: 3,  step: 0.1, default: -1  },
      { key: 'sig0', label: 'Prior σ₀',        min: 0.2, max: 3,  step: 0.1, default: 1.5 },
      { key: 'mu1',  label: 'Likelihood μ₁',  min: -3,  max: 3,  step: 0.1, default: 2   },
      { key: 'sig1', label: 'Likelihood σ₁',  min: 0.2, max: 3,  step: 0.1, default: 1   },
    ],
    generate(params) {
      const { mu0, sig0, mu1, sig1 } = params
      const varPost = 1 / (1 / sig0 ** 2 + 1 / sig1 ** 2)
      const sigPost = Math.sqrt(varPost)
      const muPost = varPost * (mu0 / sig0 ** 2 + mu1 / sig1 ** 2)
      const x = linspace(-6, 6, 400)
      const norm = (xi: number, mu: number, sig: number) =>
        (1 / (sig * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xi - mu) / sig) ** 2)
      const likScale = sig0 / sig1
      return {
        traces: [
          { x, y: x.map(xi => norm(xi, mu0, sig0)),             type: 'scatter', mode: 'lines', name: 'Prior',              line: { color: INDIGO, width: 2 } },
          { x, y: x.map(xi => norm(xi, mu1, sig1) * likScale),  type: 'scatter', mode: 'lines', name: 'Likelihood (scaled)', line: { color: AMBER,  width: 2, dash: 'dot' } },
          { x, y: x.map(xi => norm(xi, muPost, sigPost)),        type: 'scatter', mode: 'lines', name: 'Posterior',           line: { color: ROSE,   width: 2.5 } },
        ],
        xLabel: 'θ', yLabel: 'density',
      }
    },
  },

  // ── CALCULUS ─────────────────────────────────────────────────────────────

  {
    id: 'sine-wave',
    name: 'Sine Wave',
    category: 'calculus',
    mode: '2d',
    description: 'The fundamental oscillation — amplitude, frequency, and phase shift.',
    formulaText: 'y = A · sin(ωx + φ)',
    params: [
      { key: 'A',     label: 'A (amplitude)',   min: 0.1,  max: 5,    step: 0.1,  default: 1    },
      { key: 'omega', label: 'ω (frequency)',   min: 0.1,  max: 5,    step: 0.1,  default: 1    },
      { key: 'phi',   label: 'φ (phase shift)', min: -3.14, max: 3.14, step: 0.05, default: 0   },
    ],
    generate(params) {
      const { A, omega, phi } = params
      const x = linspace(-4 * Math.PI, 4 * Math.PI, 600)
      const y = x.map(xi => A * Math.sin(omega * xi + phi))
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'y', line: { color: INDIGO, width: 2 } }],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'taylor-sin',
    name: 'Taylor Series — sin(x)',
    category: 'calculus',
    mode: '2d',
    description: 'Polynomial approximation of sin(x) — watch how more terms improve accuracy.',
    formulaText: 'sin(x) ≈ Σ (−1)^k · x^(2k+1) / (2k+1)!',
    params: [
      { key: 'N', label: 'N (terms)', min: 1, max: 8, step: 1, default: 3 },
    ],
    generate(params) {
      const N = Math.floor(params.N)
      const x = linspace(-4 * Math.PI, 4 * Math.PI, 600)
      const exact = x.map(xi => Math.sin(xi))
      const approx = x.map(xi => {
        let sum = 0
        for (let k = 0; k < N; k++) sum += Math.pow(-1, k) * Math.pow(xi, 2 * k + 1) / factorial(2 * k + 1)
        return sum
      })
      return {
        traces: [
          { x, y: exact,  type: 'scatter', mode: 'lines', name: 'sin(x)',       line: { color: INDIGO, width: 2 } },
          { x, y: approx.map(v => Math.max(-10, Math.min(10, v))), type: 'scatter', mode: 'lines', name: `Taylor N=${N}`, line: { color: ROSE, width: 2, dash: 'dash' } },
        ],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'fourier-square',
    name: 'Fourier Series — Square Wave',
    category: 'calculus',
    mode: '2d',
    description: 'Summing odd harmonics of sine waves to approximate a square wave (Gibbs phenomenon).',
    formulaText: 'f(x) = (4/π) Σ sin((2n−1)x) / (2n−1)',
    params: [
      { key: 'N', label: 'N (harmonics)', min: 1, max: 15, step: 1, default: 5 },
    ],
    generate(params) {
      const N = Math.floor(params.N)
      const x = linspace(-2 * Math.PI, 2 * Math.PI, 800)
      const y = x.map(xi => {
        let sum = 0
        for (let n = 1; n <= N; n++) sum += Math.sin((2 * n - 1) * xi) / (2 * n - 1)
        return (4 / Math.PI) * sum
      })
      const sq = x.map(xi => Math.sign(Math.sin(xi)))
      return {
        traces: [
          { x, y: sq, type: 'scatter', mode: 'lines', name: 'Square wave',  line: { color: INDIGO, width: 1.5, dash: 'dot' } },
          { x, y,     type: 'scatter', mode: 'lines', name: `Fourier N=${N}`, line: { color: ROSE, width: 2 } },
        ],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'logistic',
    name: 'Logistic (Sigmoid) Function',
    category: 'calculus',
    mode: '2d',
    description: 'S-shaped curve used in neural networks and population growth models.',
    formulaText: 'f(x) = L / (1 + e^(−k(x − x₀)))',
    params: [
      { key: 'L',  label: 'L (max value)',   min: 0.1, max: 5, step: 0.1, default: 1 },
      { key: 'k',  label: 'k (growth rate)', min: 0.1, max: 5, step: 0.1, default: 1 },
      { key: 'x0', label: 'x₀ (midpoint)',   min: -5,  max: 5, step: 0.1, default: 0 },
    ],
    generate(params) {
      const { L, k, x0 } = params
      const x = linspace(-10, 10, 400)
      const y = x.map(xi => L / (1 + Math.exp(-k * (xi - x0))))
      return {
        traces: [{ x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: EMERALD, width: 2.5 } }],
        xLabel: 'x', yLabel: 'f(x)',
      }
    },
  },

  {
    id: 'derivative-viz',
    name: 'Derivative Visualization',
    category: 'calculus',
    mode: '2d',
    description: 'Visualise a power function alongside its first and second derivatives.',
    formulaText: 'd/dx [xⁿ] = n·x^(n−1)',
    params: [
      { key: 'n', label: 'n (power)', min: 1, max: 5, step: 1, default: 3 },
    ],
    generate(params) {
      const n = Math.floor(params.n)
      const x = linspace(-3, 3, 400)
      const f   = x.map(xi => Math.pow(xi, n))
      const fp  = x.map(xi => n * Math.pow(xi, n - 1))
      const fpp = n > 1 ? x.map(xi => n * (n - 1) * Math.pow(xi, n - 2)) : null
      const traces: FormulaTrace[] = [
        { x, y: f,  type: 'scatter', mode: 'lines', name: `f = x^${n}`,          line: { color: INDIGO, width: 2 } },
        { x, y: fp, type: 'scatter', mode: 'lines', name: `f' = ${n}x^${n - 1}`, line: { color: ROSE,   width: 2 } },
      ]
      if (fpp) traces.push({ x, y: fpp, type: 'scatter', mode: 'lines', name: `f'' = ${n * (n - 1)}x^${n - 2}`, line: { color: AMBER, width: 2 } })
      return { traces, xLabel: 'x', yLabel: 'y' }
    },
  },

  {
    id: 'gaussian-integral',
    name: 'Gaussian Integral',
    category: 'calculus',
    mode: '2d',
    description: 'The classic Gaussian bell visualised with a shaded definite integral region.',
    formulaText: '∫ e^(−x²/2σ²) dx = σ√(2π)',
    params: [
      { key: 'sigma', label: 'σ',             min: 0.1, max: 3,   step: 0.1, default: 1  },
      { key: 'a',     label: 'a (lower bound)', min: -5,  max: 4.9, step: 0.1, default: -1 },
      { key: 'b',     label: 'b (upper bound)', min: -4.9, max: 5,  step: 0.1, default: 1  },
    ],
    generate(params) {
      const { sigma, a, b } = params
      const lo = Math.min(a, b), hi = Math.max(a, b)
      const x = linspace(-5, 5, 600)
      const y = x.map(xi => Math.exp(-xi * xi / (2 * sigma * sigma)))
      const xFill = x.filter(xi => xi >= lo && xi <= hi)
      const yFill = xFill.map(xi => Math.exp(-xi * xi / (2 * sigma * sigma)))
      return {
        traces: [
          { x, y, type: 'scatter', mode: 'lines', name: 'f(x)', line: { color: INDIGO, width: 2 } },
          {
            x: [lo, ...xFill, hi], y: [0, ...yFill, 0],
            type: 'scatter', fill: 'toself', fillcolor: 'rgba(99,102,241,0.25)',
            mode: 'lines', line: { width: 0 }, name: '∫f dx',
          },
        ],
        xLabel: 'x', yLabel: 'e^(−x²/2σ²)',
      }
    },
  },

  {
    id: 'sinc-3d',
    name: 'Sinc Ripple (3D)',
    category: 'calculus',
    mode: '3d',
    description: 'The 2D sinc function — concentric ripples emanating from the origin.',
    formulaText: 'z = sin(r)/r,   r = √(x² + y²)',
    params: [
      { key: 'freq', label: 'frequency', min: 0.5, max: 3, step: 0.1, default: 1 },
    ],
    generate(params) {
      const { freq } = params
      const xs = linspace(-10, 10, 60)
      const ys = linspace(-10, 10, 60)
      const z = ys.map(yi => xs.map(xi => {
        const r = freq * Math.sqrt(xi * xi + yi * yi) + 0.0001
        return Math.sin(r) / r
      }))
      return {
        traces: [{ x: xs, y: ys, z, type: 'surface', colorscale: 'Viridis', showscale: false } as FormulaTrace],
        xLabel: 'x', yLabel: 'y', zLabel: 'z',
      }
    },
  },

  {
    id: 'wave-surface-3d',
    name: 'Wave Surface (3D)',
    category: 'calculus',
    mode: '3d',
    description: 'Product of sine and cosine creating a 2D standing-wave interference pattern.',
    formulaText: 'z = sin(ωₓ·x) · cos(ωᵧ·y)',
    params: [
      { key: 'wx', label: 'ωₓ (x-frequency)', min: 0.1, max: 3, step: 0.1, default: 1 },
      { key: 'wy', label: 'ωᵧ (y-frequency)', min: 0.1, max: 3, step: 0.1, default: 1 },
    ],
    generate(params) {
      const { wx, wy } = params
      const xs = linspace(-2 * Math.PI, 2 * Math.PI, 50)
      const ys = linspace(-2 * Math.PI, 2 * Math.PI, 50)
      const z = ys.map(yi => xs.map(xi => Math.sin(wx * xi) * Math.cos(wy * yi)))
      return {
        traces: [{ x: xs, y: ys, z, type: 'surface', colorscale: 'RdBu', showscale: false } as FormulaTrace],
        xLabel: 'x', yLabel: 'y', zLabel: 'z',
      }
    },
  },

  {
    id: 'gaussian-hill-3d',
    name: 'Gaussian Hill (3D)',
    category: 'calculus',
    mode: '3d',
    description: 'A 2D Gaussian bell surface — intuition for multivariate normal distributions.',
    formulaText: 'z = H · e^(−(x²+y²)/2σ²)',
    params: [
      { key: 'sigma', label: 'σ (spread)', min: 0.3, max: 4,  step: 0.1, default: 1.5 },
      { key: 'H',     label: 'H (height)', min: 0.1, max: 5,  step: 0.1, default: 1   },
    ],
    generate(params) {
      const { sigma, H } = params
      const xs = linspace(-5, 5, 50)
      const ys = linspace(-5, 5, 50)
      const z = ys.map(yi => xs.map(xi => H * Math.exp(-(xi * xi + yi * yi) / (2 * sigma * sigma))))
      return {
        traces: [{ x: xs, y: ys, z, type: 'surface', colorscale: 'Hot', showscale: false } as FormulaTrace],
        xLabel: 'x', yLabel: 'y', zLabel: 'z',
      }
    },
  },

  {
    id: 'eulers-helix',
    name: "Euler's Formula Helix (3D)",
    category: 'calculus',
    mode: '3d',
    description: "Euler's formula e^(it) = cos(t) + i·sin(t) traced as a 3D helix in complex space.",
    formulaText: 'e^(it) = cos(t) + i·sin(t)',
    params: [
      { key: 'turns', label: 'turns', min: 1, max: 6, step: 0.5, default: 3 },
    ],
    generate(params) {
      const { turns } = params
      const t = linspace(0, 2 * Math.PI * turns, 600)
      const xH = t.map(ti => Math.cos(ti))
      const yH = t.map(ti => Math.sin(ti))
      const zH = t.map(ti => ti / (2 * Math.PI))
      const zFloor = zH.map(() => 0)
      return {
        traces: [
          { x: xH, y: yH, z: zH,     type: 'scatter3d', mode: 'lines', name: 'Helix e^(it)',    line: { color: '#6366f1', width: 4 } } as FormulaTrace,
          { x: xH, y: yH, z: zFloor, type: 'scatter3d', mode: 'lines', name: 'xy-projection', line: { color: 'rgba(99,102,241,0.3)', width: 1.5 } } as FormulaTrace,
        ],
        xLabel: 'Re', yLabel: 'Im', zLabel: 't/2π',
      }
    },
  },

  // ── TRIG ─────────────────────────────────────────────────────────────────

  {
    id: 'trig-functions',
    name: 'Trig Functions',
    category: 'trig',
    mode: '2d',
    description: 'sin, cos, and tan compared — observe the period, amplitude, and asymptotes.',
    formulaText: 'sin(x), cos(x), tan(x)',
    params: [
      { key: 'periods', label: 'periods shown', min: 0.5, max: 4, step: 0.5, default: 2 },
    ],
    generate(params) {
      const { periods } = params
      const x = linspace(-periods * Math.PI, periods * Math.PI, 800)
      const tanY = x.map(xi => { const v = Math.tan(xi); return isFinite(v) && Math.abs(v) < 12 ? v : null })
      return {
        traces: [
          { x, y: x.map(xi => Math.sin(xi)), type: 'scatter', mode: 'lines', name: 'sin(x)', line: { color: INDIGO, width: 2 } },
          { x, y: x.map(xi => Math.cos(xi)), type: 'scatter', mode: 'lines', name: 'cos(x)', line: { color: ROSE,   width: 2 } },
          { x, y: tanY,                       type: 'scatter', mode: 'lines', name: 'tan(x)', line: { color: AMBER,  width: 2 } },
        ],
        xLabel: 'x (radians)', yLabel: 'y',
      }
    },
  },

  {
    id: 'hyperbolic',
    name: 'Hyperbolic Functions',
    category: 'trig',
    mode: '2d',
    description: 'sinh, cosh, tanh — analogues of trig for the unit hyperbola. cosh is the catenary curve.',
    formulaText: 'sinh(x) = (eˣ−e⁻ˣ)/2,  cosh(x) = (eˣ+e⁻ˣ)/2,  tanh = sinh/cosh',
    params: [],
    generate() {
      const x = linspace(-4, 4, 400)
      return {
        traces: [
          { x, y: x.map(xi => Math.sinh(xi)), type: 'scatter', mode: 'lines', name: 'sinh(x)', line: { color: INDIGO,  width: 2 } },
          { x, y: x.map(xi => Math.cosh(xi)), type: 'scatter', mode: 'lines', name: 'cosh(x)', line: { color: ROSE,    width: 2 } },
          { x, y: x.map(xi => Math.tanh(xi)), type: 'scatter', mode: 'lines', name: 'tanh(x)', line: { color: EMERALD, width: 2 } },
        ],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'inverse-trig',
    name: 'Inverse Trig Functions',
    category: 'trig',
    mode: '2d',
    description: 'arcsin and arccos are defined on [−1,1]; arctan is defined everywhere with asymptotes at ±π/2.',
    formulaText: 'arcsin(x), arccos(x), arctan(x)',
    params: [],
    generate() {
      const x01 = linspace(-1, 1, 200)
      const xAll = linspace(-6, 6, 400)
      return {
        traces: [
          { x: x01,  y: x01.map(xi => Math.asin(xi)),  type: 'scatter', mode: 'lines', name: 'arcsin(x)', line: { color: INDIGO, width: 2 } },
          { x: x01,  y: x01.map(xi => Math.acos(xi)),  type: 'scatter', mode: 'lines', name: 'arccos(x)', line: { color: ROSE,   width: 2 } },
          { x: xAll, y: xAll.map(xi => Math.atan(xi)), type: 'scatter', mode: 'lines', name: 'arctan(x)', line: { color: AMBER,  width: 2 } },
        ],
        xLabel: 'x', yLabel: 'y (radians)',
      }
    },
  },

  {
    id: 'damped-oscillation',
    name: 'Damped Oscillation',
    category: 'trig',
    mode: '2d',
    description: 'Exponentially decaying sinusoid — models friction, resistance, and energy loss in oscillators.',
    formulaText: 'y = A · e^(−γt) · cos(ωt + φ)',
    params: [
      { key: 'A',     label: 'A (amplitude)',  min: 0.1,  max: 5,    step: 0.1,  default: 2   },
      { key: 'gamma', label: 'γ (damping)',    min: 0.01, max: 2,    step: 0.01, default: 0.2 },
      { key: 'omega', label: 'ω (frequency)',  min: 0.1,  max: 10,   step: 0.1,  default: 3   },
      { key: 'phi',   label: 'φ (phase)',      min: -3.14, max: 3.14, step: 0.05, default: 0  },
    ],
    generate(params) {
      const { A, gamma, omega, phi } = params
      const tMax = Math.min(40, Math.max(20, 8 / gamma))
      const t = linspace(0, tMax, 800)
      const y   = t.map(ti => A * Math.exp(-gamma * ti) * Math.cos(omega * ti + phi))
      const env = t.map(ti => A * Math.exp(-gamma * ti))
      return {
        traces: [
          { x: t, y: env.map(v => -v), type: 'scatter', mode: 'lines', name: '−envelope', line: { color: VIOLET, width: 1, dash: 'dot' } },
          { x: t, y: env,              type: 'scatter', mode: 'lines', name: 'envelope',   line: { color: VIOLET, width: 1, dash: 'dot' } },
          { x: t, y,                   type: 'scatter', mode: 'lines', name: 'y(t)',        line: { color: INDIGO, width: 2.5 } },
        ],
        xLabel: 't', yLabel: 'y',
      }
    },
  },

  {
    id: 'lissajous',
    name: 'Lissajous Figure',
    category: 'trig',
    mode: '2d',
    description: 'Parametric curves from two perpendicular sinusoids — frequency ratios produce beautiful closed knots.',
    formulaText: 'x = sin(at + δ),   y = sin(bt)',
    params: [
      { key: 'a',     label: 'a (x-freq)',     min: 1, max: 8,    step: 1,    default: 3              },
      { key: 'b',     label: 'b (y-freq)',     min: 1, max: 8,    step: 1,    default: 2              },
      { key: 'delta', label: 'δ (phase shift)', min: 0, max: 3.14, step: 0.05, default: Math.PI / 4   },
    ],
    generate(params) {
      const { a, b, delta } = params
      const t = linspace(0, 2 * Math.PI * Math.max(a, b), 2000)
      return {
        traces: [{ x: t.map(ti => Math.sin(a * ti + delta)), y: t.map(ti => Math.sin(b * ti)), type: 'scatter', mode: 'lines', name: `a=${a}, b=${b}`, line: { color: VIOLET, width: 2 } }],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'polar-rose',
    name: 'Polar Rose',
    category: 'trig',
    mode: '2d',
    description: 'r = cos(nθ) — n petals when n is odd, 2n when n is even. Elegant trig symmetry.',
    formulaText: 'r = a·cos(nθ),   x = r·cos(θ),   y = r·sin(θ)',
    params: [
      { key: 'n', label: 'n (petals)',    min: 1, max: 9, step: 1,   default: 5   },
      { key: 'a', label: 'a (amplitude)', min: 0.1, max: 2, step: 0.1, default: 1 },
    ],
    generate(params) {
      const { n, a } = params
      const theta = linspace(0, 2 * Math.PI, 2000)
      const r = theta.map(t => a * Math.cos(n * t))
      return {
        traces: [{ x: theta.map((t, i) => r[i] * Math.cos(t)), y: theta.map((t, i) => r[i] * Math.sin(t)), type: 'scatter', mode: 'lines', name: `r=cos(${n}θ)`, line: { color: ROSE, width: 2 } }],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'archimedean-spiral',
    name: 'Archimedean Spiral',
    category: 'trig',
    mode: '2d',
    description: 'r = aθ — constant spacing between turns, unlike the logarithmic spiral.',
    formulaText: 'r = a·θ,   x = r·cos(θ),   y = r·sin(θ)',
    params: [
      { key: 'a',     label: 'a (growth rate)', min: 0.05, max: 1,   step: 0.05, default: 0.2 },
      { key: 'turns', label: 'turns',           min: 1,    max: 8,   step: 0.5,  default: 4   },
    ],
    generate(params) {
      const { a, turns } = params
      const theta = linspace(0, 2 * Math.PI * turns, 1500)
      const r = theta.map(t => a * t)
      return {
        traces: [{ x: theta.map((t, i) => r[i] * Math.cos(t)), y: theta.map((t, i) => r[i] * Math.sin(t)), type: 'scatter', mode: 'lines', name: 'spiral', line: { color: EMERALD, width: 2 } }],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'beats',
    name: 'Beats — Sum of Sinusoids',
    category: 'trig',
    mode: '2d',
    description: 'Two close frequencies interfere to produce a slow amplitude modulation — the "beats" in music and physics.',
    formulaText: 'y = cos(ω₁t) + cos(ω₂t) = 2·cos(Δω·t/2)·cos(ω̄·t)',
    params: [
      { key: 'omega1', label: 'ω₁', min: 1, max: 20, step: 0.1, default: 10   },
      { key: 'omega2', label: 'ω₂', min: 1, max: 20, step: 0.1, default: 11.5 },
    ],
    generate(params) {
      const { omega1, omega2 } = params
      const beatFreq = Math.abs(omega1 - omega2)
      const tMax = Math.min(20, (beatFreq > 0.01 ? 4 * Math.PI / beatFreq : 20))
      const t = linspace(0, tMax, 1500)
      const y   = t.map(ti => Math.cos(omega1 * ti) + Math.cos(omega2 * ti))
      const env = t.map(ti => 2 * Math.abs(Math.cos(beatFreq / 2 * ti)))
      return {
        traces: [
          { x: t, y,    type: 'scatter', mode: 'lines', name: 'sum',      line: { color: INDIGO, width: 1.5 } },
          { x: t, y: env, type: 'scatter', mode: 'lines', name: 'envelope', line: { color: AMBER, width: 1.5, dash: 'dash' } },
        ],
        xLabel: 't', yLabel: 'y',
      }
    },
  },

  // ── PHYSICS ──────────────────────────────────────────────────────────────

  {
    id: 'classical-wave',
    name: 'Classical Wave Function',
    category: 'physics',
    mode: '2d',
    description: 'A travelling wave y(x,t) = A·sin(kx − ωt). Drag t to watch the wave propagate in space.',
    formulaText: 'y(x,t) = A · sin(kx − ωt)',
    params: [
      { key: 'A',     label: 'A (amplitude)',     min: 0.1, max: 3,  step: 0.1, default: 1 },
      { key: 'k',     label: 'k (wave number)',   min: 0.1, max: 5,  step: 0.1, default: 1 },
      { key: 'omega', label: 'ω (angular freq)',  min: 0.1, max: 5,  step: 0.1, default: 1 },
      { key: 't',     label: 't (time snapshot)', min: 0,   max: 10, step: 0.1, default: 0 },
    ],
    generate(params) {
      const { A, k, omega, t } = params
      const x = linspace(-4 * Math.PI, 4 * Math.PI, 600)
      return {
        traces: [{ x, y: x.map(xi => A * Math.sin(k * xi - omega * t)), type: 'scatter', mode: 'lines', name: `t = ${t.toFixed(1)}`, line: { color: INDIGO, width: 2.5 } }],
        xLabel: 'x (position)', yLabel: 'y (displacement)',
      }
    },
  },

  {
    id: 'standing-wave',
    name: 'Standing Wave',
    category: 'physics',
    mode: '2d',
    description: 'Superposition of two opposing travelling waves creates fixed nodes and antinodes.',
    formulaText: 'y = A·sin(kx−ωt) + A·sin(kx+ωt) = 2A·sin(kx)·cos(ωt)',
    params: [
      { key: 'A',     label: 'A (amplitude)',   min: 0.1, max: 3,  step: 0.1, default: 1 },
      { key: 'k',     label: 'k (wave number)', min: 0.5, max: 5,  step: 0.1, default: 1 },
      { key: 'omega', label: 'ω (freq)',         min: 0.1, max: 5,  step: 0.1, default: 1 },
      { key: 't',     label: 't (time)',         min: 0,   max: 10, step: 0.1, default: 0 },
    ],
    generate(params) {
      const { A, k, omega, t } = params
      const x = linspace(0, 4 * Math.PI, 600)
      const y   = x.map(xi => 2 * A * Math.sin(k * xi) * Math.cos(omega * t))
      const env = x.map(xi => 2 * A * Math.abs(Math.sin(k * xi)))
      return {
        traces: [
          { x, y: env.map(v => -v), type: 'scatter', mode: 'lines', name: '−envelope', line: { color: ROSE,   width: 1, dash: 'dot' } },
          { x, y: env,              type: 'scatter', mode: 'lines', name: 'envelope',   line: { color: ROSE,   width: 1, dash: 'dot' } },
          { x, y,                   type: 'scatter', mode: 'lines', name: 'y(x,t)',     line: { color: INDIGO, width: 2.5 } },
        ],
        xLabel: 'x', yLabel: 'y',
      }
    },
  },

  {
    id: 'particle-in-box',
    name: 'Particle in a Box',
    category: 'physics',
    mode: '2d',
    description: 'Quantum eigenstates ψₙ(x) of a particle confined to a 1D box — probability density |ψ|² shown.',
    formulaText: 'ψₙ(x) = √(2/L) · sin(nπx/L),   |ψ|² = probability density',
    params: [
      { key: 'n', label: 'n (quantum number)', min: 1, max: 6, step: 1,   default: 1 },
      { key: 'L', label: 'L (box length)',      min: 1, max: 5, step: 0.1, default: 1 },
    ],
    generate(params) {
      const { n, L } = params
      const x = linspace(0, L, 400)
      const psi  = x.map(xi => Math.sqrt(2 / L) * Math.sin(n * Math.PI * xi / L))
      const prob = psi.map(v => v * v)
      return {
        traces: [
          { x, y: psi,  type: 'scatter', mode: 'lines', name: 'ψₙ(x)',  line: { color: INDIGO, width: 2 } },
          { x, y: prob, type: 'scatter', mode: 'lines', fill: 'tozeroy', fillcolor: 'rgba(244,63,94,0.12)', name: '|ψ|²', line: { color: ROSE, width: 2, dash: 'dash' } },
        ],
        xLabel: 'x', yLabel: 'ψ / |ψ|²',
      }
    },
  },

  {
    id: 'quantum-harmonic',
    name: 'Quantum Harmonic Oscillator',
    category: 'physics',
    mode: '2d',
    description: 'Eigenstates ψₙ via Hermite polynomials, overlaid on the parabolic potential. Energy levels Eₙ = ℏω(n+½).',
    formulaText: 'ψₙ(x) ∝ Hₙ(x) · e^(−x²/2),   Eₙ = ℏω(n + ½)',
    params: [
      { key: 'n', label: 'n (quantum number)', min: 0, max: 5, step: 1, default: 0 },
    ],
    generate(params) {
      const n = Math.floor(params.n)
      function hermite(m: number, x: number): number {
        if (m === 0) return 1
        if (m === 1) return 2 * x
        let hm2 = 1, hm1 = 2 * x
        for (let k = 2; k <= m; k++) { const h = 2 * x * hm1 - 2 * (k - 1) * hm2; hm2 = hm1; hm1 = h }
        return hm1
      }
      const norm = Math.pow(1 / Math.PI, 0.25) / Math.sqrt(Math.pow(2, n) * factorial(n))
      const x = linspace(-5, 5, 500)
      const psi  = x.map(xi => norm * hermite(n, xi) * Math.exp(-xi * xi / 2))
      const prob = psi.map(v => v * v)
      const En = n + 0.5
      return {
        traces: [
          { x, y: x.map(xi => xi * xi / 2),       type: 'scatter', mode: 'lines', name: 'V(x) = x²/2',     line: { color: '#d1d5db', width: 1.5 } },
          { x, y: x.map(() => En),                 type: 'scatter', mode: 'lines', name: `E_${n} = ${En}ℏω`, line: { color: AMBER,    width: 1,   dash: 'dot' } },
          { x, y: psi.map(v => v + En),            type: 'scatter', mode: 'lines', name: `ψ_${n}(x)`,        line: { color: INDIGO,   width: 2 } },
          { x, y: prob.map(v => v + En),           type: 'scatter', mode: 'lines', name: '|ψ|²',             line: { color: ROSE,     width: 2,   dash: 'dash' } },
        ],
        xLabel: 'x (dimensionless)', yLabel: 'Energy / ℏω',
      }
    },
  },

  {
    id: 'blackbody',
    name: 'Blackbody Radiation',
    category: 'physics',
    mode: '2d',
    description: "Planck's law — spectral radiance vs wavelength. Wien's law gives the peak; Stefan-Boltzmann gives total power.",
    formulaText: 'B(λ,T) = 2hc²/λ⁵ · 1/(e^(hc/λkT) − 1)',
    params: [
      { key: 'T', label: 'T (temperature K)', min: 1000, max: 12000, step: 100, default: 5778 },
    ],
    generate(params) {
      const { T } = params
      const h = 6.626e-34, c = 3e8, kB = 1.381e-23
      const lambda = linspace(100e-9, 3000e-9, 500)
      const B = lambda.map(l => { const e = Math.exp((h * c) / (l * kB * T)); return isFinite(e) && e > 1 ? (2 * h * c * c) / Math.pow(l, 5) / (e - 1) : 0 })
      const maxB = Math.max(...B)
      return {
        traces: [{
          x: lambda.map(l => Math.round(l * 1e9)),
          y: B.map(v => maxB > 0 ? v / maxB : 0),
          type: 'scatter', mode: 'lines', name: `T = ${T} K`,
          line: { color: AMBER, width: 2.5 },
          fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.15)',
        }],
        xLabel: 'λ (nm)', yLabel: 'Spectral radiance (normalised)',
      }
    },
  },

  {
    id: 'lorentz',
    name: 'Lorentz Factor',
    category: 'physics',
    mode: '2d',
    description: 'γ = 1/√(1−v²/c²) — time dilation and length contraction blow up as v → c.',
    formulaText: 'γ(β) = 1 / √(1 − β²),   β = v/c',
    params: [],
    generate() {
      const beta = linspace(0, 0.9999, 500)
      return {
        traces: [{ x: beta, y: beta.map(b => 1 / Math.sqrt(1 - b * b)), type: 'scatter', mode: 'lines', name: 'γ(β)', line: { color: VIOLET, width: 2.5 } }],
        xLabel: 'β = v/c', yLabel: 'γ (Lorentz factor)',
      }
    },
  },

  {
    id: 'maxwell-boltzmann',
    name: 'Maxwell-Boltzmann Speed',
    category: 'physics',
    mode: '2d',
    description: 'Speed distribution of ideal gas molecules — most probable, mean, and rms speeds shown.',
    formulaText: 'f(v) = 4π(m/2πkT)^(3/2) · v² · e^(−mv²/2kT)',
    params: [
      { key: 'T', label: 'T (temperature K)', min: 100,  max: 3000, step: 50, default: 300 },
      { key: 'm', label: 'm (mass amu)',       min: 1,    max: 200,  step: 1,  default: 28  },
    ],
    generate(params) {
      const { T, m } = params
      const kB = 1.381e-23, amu = 1.66e-27
      const mass = m * amu
      const vp = Math.sqrt(2 * kB * T / mass)
      const v = linspace(0, 5 * vp, 500)
      const f = v.map(vi => { const c = 4 * Math.PI * Math.pow(mass / (2 * Math.PI * kB * T), 1.5); return c * vi * vi * Math.exp(-mass * vi * vi / (2 * kB * T)) })
      const maxF = Math.max(...f)
      const vmean = Math.sqrt(8 * kB * T / (Math.PI * mass))
      const vrms  = Math.sqrt(3 * kB * T / mass)
      const toKms = (vi: number) => vi / 1000
      return {
        traces: [
          { x: v.map(toKms), y: f.map(fi => maxF > 0 ? fi / maxF : 0), type: 'scatter', mode: 'lines', name: 'f(v)', line: { color: EMERALD, width: 2.5 }, fill: 'tozeroy', fillcolor: 'rgba(16,185,129,0.12)' },
          { x: [toKms(vp)],    y: [0], type: 'scatter', mode: 'markers+text', name: `vₚ = ${toKms(vp).toFixed(2)} km/s`,   marker: { color: VIOLET, size: 9 }, text: ['vₚ'],   textposition: 'top center' },
          { x: [toKms(vmean)], y: [0], type: 'scatter', mode: 'markers+text', name: `v̄  = ${toKms(vmean).toFixed(2)} km/s`, marker: { color: ROSE,   size: 9 }, text: ['v̄'],   textposition: 'top center' },
          { x: [toKms(vrms)],  y: [0], type: 'scatter', mode: 'markers+text', name: `vᵣₘₛ= ${toKms(vrms).toFixed(2)} km/s`, marker: { color: AMBER,  size: 9 }, text: ['vᵣₘₛ'], textposition: 'top center' },
        ],
        xLabel: 'v (km/s)', yLabel: 'f(v) (normalised)',
      }
    },
  },

  {
    id: 'projectile',
    name: 'Projectile Motion',
    category: 'physics',
    mode: '2d',
    description: 'Classical trajectory under gravity — 45° maximises range; compare angles.',
    formulaText: 'x = v₀cos(θ)t,   y = v₀sin(θ)t − ½gt²',
    params: [
      { key: 'v0',    label: 'v₀ (m/s)',     min: 1,  max: 100, step: 1,   default: 30   },
      { key: 'angle', label: 'θ (degrees)',   min: 1,  max: 89,  step: 1,   default: 45   },
      { key: 'g',     label: 'g (m/s²)',      min: 1,  max: 25,  step: 0.1, default: 9.81 },
    ],
    generate(params) {
      const { v0, angle, g } = params
      const th = angle * Math.PI / 180
      const tFlight = 2 * v0 * Math.sin(th) / g
      const t = linspace(0, tFlight, 400)
      const x = t.map(ti => v0 * Math.cos(th) * ti)
      const y = t.map(ti => Math.max(0, v0 * Math.sin(th) * ti - 0.5 * g * ti * ti))
      const refs = [30, 45, 60].filter(a => Math.abs(a - angle) > 3)
      const refTraces = refs.map(a => {
        const rth = a * Math.PI / 180, rtf = 2 * v0 * Math.sin(rth) / g
        const rt = linspace(0, rtf, 200)
        return { x: rt.map(ti => v0 * Math.cos(rth) * ti), y: rt.map(ti => Math.max(0, v0 * Math.sin(rth) * ti - 0.5 * g * ti * ti)), type: 'scatter', mode: 'lines', name: `θ=${a}°`, line: { color: '#d1d5db', width: 1, dash: 'dot' } }
      })
      return {
        traces: [...refTraces, { x, y, type: 'scatter', mode: 'lines', name: `θ=${angle}°`, line: { color: INDIGO, width: 2.5 } }],
        xLabel: 'x (m)', yLabel: 'y (m)',
      }
    },
  },

  {
    id: 'radial-potential',
    name: '1/r² Radial Field',
    category: 'physics',
    mode: '2d',
    description: 'Gravity and Coulomb both follow an inverse-square force law — force and potential vs distance.',
    formulaText: 'F = k/r²,   V = −k/r',
    params: [
      { key: 'k',    label: 'k (coupling)', min: 0.1, max: 5,  step: 0.1, default: 1  },
      { key: 'rMax', label: 'r max',        min: 2,   max: 20, step: 0.5, default: 10 },
    ],
    generate(params) {
      const { k, rMax } = params
      const r = linspace(0.25, rMax, 400)
      return {
        traces: [
          { x: r, y: r.map(ri => k / (ri * ri)),  type: 'scatter', mode: 'lines', name: 'Force F = k/r²',     line: { color: INDIGO, width: 2 } },
          { x: r, y: r.map(ri => -k / ri),         type: 'scatter', mode: 'lines', name: 'Potential V = −k/r', line: { color: ROSE,   width: 2 } },
        ],
        xLabel: 'r (distance)', yLabel: 'F or V',
      }
    },
  },

  {
    id: 'damped-harmonic',
    name: 'Damped Harmonic Oscillator',
    category: 'physics',
    mode: '2d',
    description: 'Under-, critically-, and over-damped solutions of mx″ + bx′ + kx = 0. ζ < 1 oscillates; ζ > 1 decays without oscillation.',
    formulaText: 'ζ < 1: e^(−γt)·cos(ωdt)   ζ = 1: (1+ω₀t)e^(−ω₀t)   ζ > 1: overdamped',
    params: [
      { key: 'omega0', label: 'ω₀ (natural freq)', min: 0.5, max: 5,  step: 0.1,  default: 2   },
      { key: 'zeta',   label: 'ζ (damping ratio)', min: 0,   max: 2,  step: 0.02, default: 0.2 },
    ],
    generate(params) {
      const { omega0, zeta } = params
      const gamma = zeta * omega0
      const tMax = Math.min(30, gamma > 0 ? Math.max(10, 8 / gamma) : 20)
      const t = linspace(0, tMax, 600)
      let y: number[]
      if (zeta < 1) {
        const wd = omega0 * Math.sqrt(1 - zeta * zeta)
        y = t.map(ti => Math.exp(-gamma * ti) * Math.cos(wd * ti))
      } else if (Math.abs(zeta - 1) < 0.01) {
        y = t.map(ti => (1 + omega0 * ti) * Math.exp(-omega0 * ti))
      } else {
        const sq = omega0 * Math.sqrt(zeta * zeta - 1)
        y = t.map(ti => 0.5 * Math.exp((-gamma + sq) * ti) + 0.5 * Math.exp((-gamma - sq) * ti))
      }
      const label = zeta < 1 ? 'underdamped' : Math.abs(zeta - 1) < 0.01 ? 'critical' : 'overdamped'
      const env = t.map(ti => Math.exp(-gamma * ti))
      return {
        traces: [
          { x: t, y: env.map(v => -v), type: 'scatter', mode: 'lines', name: '±envelope', line: { color: AMBER, width: 1, dash: 'dot' } },
          { x: t, y: env,              type: 'scatter', mode: 'lines', name: '',           line: { color: AMBER, width: 1, dash: 'dot' }, showlegend: false },
          { x: t, y,                   type: 'scatter', mode: 'lines', name: `x(t) — ${label}`, line: { color: INDIGO, width: 2.5 } },
        ],
        xLabel: 't (s)', yLabel: 'x(t)',
      }
    },
  },

  // ── NUMBER THEORY ─────────────────────────────────────────────────────────

  {
    id: 'zeta-real',
    name: 'Riemann Zeta ζ(s) — Real Axis',
    category: 'number',
    mode: '2d',
    description: 'ζ(s) = Σ 1/nˢ for real s > 1. Diverges at s=1 (harmonic series). Famous values: ζ(2)=π²/6 (Basel problem), ζ(4)=π⁴/90.',
    formulaText: 'ζ(s) = 1 + 1/2ˢ + 1/3ˢ + 1/4ˢ + …   (s > 1)',
    params: [
      { key: 'terms', label: 'terms in partial sum', min: 10, max: 500, step: 10, default: 200 },
    ],
    generate(params) {
      const N = Math.floor(params.terms)
      const s = linspace(1.05, 8, 500)
      const zeta = s.map(si => {
        let sum = 0
        for (let n = 1; n <= N; n++) sum += Math.pow(n, -si)
        return sum
      })
      const exactX = [2, 4, 6]
      const exactY = [Math.PI ** 2 / 6, Math.PI ** 4 / 90, Math.PI ** 6 / 945]
      const exactLabels = ['ζ(2)=π²/6', 'ζ(4)=π⁴/90', 'ζ(6)=π⁶/945']
      return {
        traces: [
          { x: s, y: zeta, type: 'scatter', mode: 'lines', name: 'ζ(s)', line: { color: INDIGO, width: 2.5 } },
          { x: exactX, y: exactY, type: 'scatter', mode: 'markers+text', name: 'exact values',
            marker: { color: ROSE, size: 9 }, text: exactLabels, textposition: 'top right' },
        ],
        xLabel: 's', yLabel: 'ζ(s)',
      }
    },
  },

  {
    id: 'zeta-critical',
    name: 'Riemann Zeta — Critical Line',
    category: 'number',
    mode: '2d',
    description: 'The Riemann-Siegel Z(t) function along the critical line s = ½ + it. Zeros of Z(t) are exactly the non-trivial zeros of ζ(s). The Riemann Hypothesis conjectures all are here.',
    formulaText: 'Z(t) = 2 Σ cos(θ(t) − t·ln n)/√n   zeros ↔ ζ(½+it) = 0',
    params: [
      { key: 'tMax', label: 't range (0 → tMax)', min: 15, max: 100, step: 5, default: 50 },
    ],
    generate(params) {
      const { tMax } = params

      // Riemann-Siegel theta approximation (Stirling)
      function theta(t: number): number {
        return (t / 2) * Math.log(t / (2 * Math.PI)) - t / 2 - Math.PI / 8 + 1 / (48 * t)
      }

      // Riemann-Siegel Z function
      function Z(t: number): number {
        const N = Math.max(1, Math.floor(Math.sqrt(t / (2 * Math.PI))))
        const th = theta(t)
        let sum = 0
        for (let n = 1; n <= N; n++) sum += Math.cos(th - t * Math.log(n)) / Math.sqrt(n)
        return 2 * sum
      }

      const t = linspace(2, tMax, 1200)
      const z = t.map(ti => Z(ti))

      // Known non-trivial zeros (imaginary parts of first 10)
      const allZeros = [14.135, 21.022, 25.011, 30.424, 32.935, 37.586, 40.919, 43.327, 48.005, 49.774]
      const zeros = allZeros.filter(v => v <= tMax)

      return {
        traces: [
          { x: t, y: z,              type: 'scatter', mode: 'lines',   name: 'Z(t)',         line: { color: INDIGO, width: 1.5 } },
          { x: t, y: t.map(() => 0), type: 'scatter', mode: 'lines',   name: 'zero axis',    line: { color: '#e5e7eb', width: 1 } },
          { x: zeros, y: zeros.map(() => 0), type: 'scatter', mode: 'markers', name: 'non-trivial zeros',
            marker: { color: ROSE, size: 10, symbol: 'x', line: { width: 2, color: ROSE } } },
        ],
        xLabel: 't', yLabel: 'Z(t)',
      }
    },
  },

  {
    id: 'elliptic-curve',
    name: 'Elliptic Curve y² = x³ + ax + b',
    category: 'number',
    mode: '2d',
    description: 'Real plot of y² = x³ + ax + b. Foundation of modern cryptography (ECC) and Wiles\'s proof of Fermat\'s Last Theorem. Singular when Δ = −16(4a³+27b²) = 0.',
    formulaText: 'y² = x³ + ax + b,   Δ = −16(4a³ + 27b²)',
    params: [
      { key: 'a', label: 'a', min: -4, max: 4, step: 0.1, default: -1 },
      { key: 'b', label: 'b', min: -4, max: 4, step: 0.1, default: 0  },
    ],
    generate(params) {
      const { a, b } = params
      const disc = -16 * (4 * a ** 3 + 27 * b ** 2)
      const singular = Math.abs(disc) < 0.5

      const xs = linspace(-2.5, 2.5, 2000)
      const yTop: (number | null)[] = []
      const yBot: (number | null)[] = []
      xs.forEach(xi => {
        const rhs = xi ** 3 + a * xi + b
        if (rhs >= 0) {
          const y = Math.sqrt(rhs)
          yTop.push(y)
          yBot.push(-y)
        } else {
          yTop.push(null)
          yBot.push(null)
        }
      })

      return {
        traces: [
          { x: xs, y: yTop, type: 'scatter', mode: 'lines', name: 'y² = x³+ax+b', line: { color: INDIGO, width: 2.5 } },
          { x: xs, y: yBot, type: 'scatter', mode: 'lines', name: '', line: { color: INDIGO, width: 2.5 }, showlegend: false },
          // Mark singular point if near-singular
          ...(singular ? [{ x: [0], y: [Math.sqrt(Math.max(0, b))], type: 'scatter', mode: 'markers+text',
            name: 'singular!', marker: { color: ROSE, size: 12, symbol: 'x' },
            text: ['singular'], textposition: 'top right' }] : []),
        ] as FormulaTrace[],
        xLabel: `x   (Δ = ${disc.toFixed(2)}${singular ? ' — SINGULAR' : ''})`,
        yLabel: 'y',
      }
    },
  },

  {
    id: 'gamma-function',
    name: 'Gamma Function Γ(x)',
    category: 'number',
    mode: '2d',
    description: 'Γ(x) = ∫₀^∞ t^(x−1)e^(−t) dt — the continuous extension of the factorial: Γ(n) = (n−1)! for positive integers. Poles at x = 0, −1, −2, …',
    formulaText: 'Γ(x) = ∫₀^∞ t^(x−1) e^(−t) dt,   Γ(n) = (n−1)!',
    params: [
      { key: 'xMin', label: 'x min', min: -4.9, max: 0.5, step: 0.5, default: -4.5 },
      { key: 'xMax', label: 'x max', min: 1, max: 8, step: 0.5, default: 5.5 },
    ],
    generate({ xMin, xMax }) {
      // Sample at high density; split into segments at poles (integers ≤ 0)
      const N = 800
      const xs = linspace(xMin, xMax, N)

      // Break the curve at discontinuities near poles (x ≈ 0, -1, -2, ...)
      const segments: { x: number[]; y: (number | null)[] }[] = [{ x: [], y: [] }]
      const CLIP = 20   // clip large values near poles

      for (const x of xs) {
        const nearPole = x < 0.05 && Number.isInteger(Math.round(x * 10) / 10)
          || (x <= 0.01 && [-4,-3,-2,-1,0].some(n => Math.abs(x - n) < 0.05))
        if (nearPole) {
          // start a new segment after each pole
          segments.push({ x: [], y: [] })
          continue
        }
        let y: number | null
        try {
          const val = gamma(x) as number
          y = Math.abs(val) > CLIP ? null : val
        } catch {
          y = null
        }
        const seg = segments[segments.length - 1]
        seg.x.push(x)
        seg.y.push(y)
      }

      const traces: FormulaTrace[] = segments
        .filter(s => s.x.length > 1)
        .map((s, i) => ({
          x: s.x,
          y: s.y,
          type: 'scatter',
          mode: 'lines',
          name: i === 0 ? 'Γ(x)' : '',
          showlegend: i === 0,
          line: { color: INDIGO, width: 2.5 },
        }))

      // Mark notable values: Γ(½) = √π, Γ(1)=1, Γ(2)=1, Γ(3)=2, Γ(4)=6
      const notable = [0.5, 1, 2, 3, 4, 5].filter(v => v >= xMin && v <= xMax)
      if (notable.length) {
        traces.push({
          x: notable,
          y: notable.map(v => gamma(v) as number),
          type: 'scatter',
          mode: 'markers+text',
          name: 'key values',
          marker: { color: ROSE, size: 7 },
          text: notable.map(v => `Γ(${v}${v===0.5?')=√π':`)=${(gamma(v) as number).toFixed(2)}`}`),
          textposition: 'top center',
        } as FormulaTrace)
      }

      return { traces, xLabel: 'x', yLabel: 'Γ(x)' }
    },
  },
]

export const PROBABILITY_FORMULAS = FORMULAS.filter(f => f.category === 'probability')
export const CALCULUS_FORMULAS    = FORMULAS.filter(f => f.category === 'calculus')
export const TRIG_FORMULAS        = FORMULAS.filter(f => f.category === 'trig')
export const NUMBER_FORMULAS      = FORMULAS.filter(f => f.category === 'number')
export const PHYSICS_FORMULAS     = FORMULAS.filter(f => f.category === 'physics')
