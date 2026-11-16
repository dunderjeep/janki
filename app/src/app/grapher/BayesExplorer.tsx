'use client'

import { useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

// ─── Math helpers ──────────────────────────────────────────────────────────────

/** Log-Gamma via Lanczos approximation */
function lnGamma(z: number): number {
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313,  -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  let x = C[0], zz = z - 1
  for (let i = 1; i < 9; i++) x += C[i] / (zz + i)
  const t = zz + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}

function lnBeta(a: number, b: number) { return lnGamma(a) + lnGamma(b) - lnGamma(a + b) }

function betaPDF(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1 || a <= 0 || b <= 0) return 0
  const v = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnBeta(a, b))
  return isFinite(v) ? v : 0
}

function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
}

function gammaPDF(x: number, alpha: number, rate: number): number {
  if (x <= 0 || alpha <= 0 || rate <= 0) return 0
  const v = Math.exp(alpha * Math.log(rate) + (alpha - 1) * Math.log(x) - rate * x - lnGamma(alpha))
  return isFinite(v) ? v : 0
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)))
}

/** Numerically find approximate p-th quantile of a PDF defined on xs/ys */
function quantile(xs: number[], ys: number[], p: number): number {
  const dx = xs[1] - xs[0]
  let cum = 0
  const total = ys.reduce((s, y) => s + y * dx, 0)
  for (let i = 0; i < xs.length; i++) {
    cum += ys[i] * dx
    if (cum / total >= p) return xs[i]
  }
  return xs[xs.length - 1]
}

// ─── Model types ───────────────────────────────────────────────────────────────

type Model = 'beta-binomial' | 'normal-normal' | 'gamma-poisson'
type ViewMode = '2d' | '3d'

const MODEL_META: { id: Model; label: string; short: string; desc: string }[] = [
  {
    id: 'beta-binomial',
    label: 'Beta-Binomial',
    short: 'B-B',
    desc: 'Coin flips, A/B testing, any yes/no process. Prior: Beta(α,β) on probability θ.',
  },
  {
    id: 'normal-normal',
    label: 'Normal-Normal',
    short: 'N-N',
    desc: 'Estimating a continuous mean (e.g. height, temperature). Prior: N(μ₀,σ₀) on mean μ.',
  },
  {
    id: 'gamma-poisson',
    label: 'Gamma-Poisson',
    short: 'Γ-Pois',
    desc: 'Counting events (clicks, radioactive decays). Prior: Gamma(α,β) on rate λ.',
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function BayesExplorer() {
  const [model,    setModel]    = useState<Model>('beta-binomial')
  const [viewMode, setViewMode] = useState<ViewMode>('2d')

  // ── Beta-Binomial params ────────────────────────────────────────────────
  const [bbAlpha,  setBbAlpha]  = useState(2)      // prior α
  const [bbBeta,   setBbBeta]   = useState(2)      // prior β
  const [bbN,      setBbN]      = useState(0)      // observed trials — start at 0 (prior only)
  const [bbK,      setBbK]      = useState(0)      // observed successes
  const [bbTrueP,  setBbTrueP]  = useState(0.6)   // simulation true p

  // ── Normal-Normal params ────────────────────────────────────────────────
  const [nnMu0,    setNnMu0]    = useState(0)      // prior mean
  const [nnSig0,   setNnSig0]   = useState(2)      // prior σ
  const [nnSig,    setNnSig]    = useState(1)      // likelihood σ (known)
  const [nnObs,    setNnObs]    = useState<number[]>([])
  const [nnTrueMu, setNnTrueMu] = useState(1.5)

  // ── Gamma-Poisson params ────────────────────────────────────────────────
  const [gpAlpha,  setGpAlpha]  = useState(2)      // prior shape
  const [gpBeta,   setGpBeta]   = useState(1)      // prior rate
  const [gpCounts, setGpCounts] = useState<number[]>([])
  const [gpTrueLam,setGpTrueLam]= useState(3)

  const [simLog,      setSimLog]      = useState<string[]>([])
  const [ciHistory,   setCiHistory]   = useState<{ n: number; width: number }[]>([])

  // ─── Posterior parameters (analytical) ─────────────────────────────────
  const posteriorParams = useMemo(() => {
    if (model === 'beta-binomial') {
      return { postA: bbAlpha + bbK, postB: bbBeta + (bbN - bbK) }
    }
    if (model === 'normal-normal') {
      const n    = nnObs.length
      const sumX = nnObs.reduce((s, x) => s + x, 0)
      const tau0 = 1 / (nnSig0 ** 2)
      const tau  = 1 / (nnSig  ** 2)
      const tauN = tau0 + n * tau
      const sigN = 1 / Math.sqrt(tauN)
      const muN  = (tau0 * nnMu0 + tau * sumX) / tauN
      return { muN, sigN }
    }
    // Gamma-Poisson
    const n      = gpCounts.length
    const sumK   = gpCounts.reduce((s, k) => s + k, 0)
    return { postAlpha: gpAlpha + sumK, postBeta: gpBeta + n }
  }, [model, bbAlpha, bbBeta, bbN, bbK, nnObs, nnMu0, nnSig0, nnSig, gpAlpha, gpBeta, gpCounts])

  // ─── 2D plot traces ─────────────────────────────────────────────────────
  const traces2D = useMemo(() => {
    const N = 400

    if (model === 'beta-binomial') {
      const xs = linspace(0.001, 0.999, N)
      const prior = xs.map(x => betaPDF(x, bbAlpha, bbBeta))
      const { postA, postB } = posteriorParams as { postA: number; postB: number }
      const post  = xs.map(x => betaPDF(x, postA, postB))

      // Likelihood (unnormalised): θ^k * (1-θ)^(n-k), scaled to same visual height
      const likeRaw = xs.map(x =>
        Math.exp(bbK * Math.log(Math.max(x, 1e-15)) + (bbN - bbK) * Math.log(Math.max(1 - x, 1e-15)))
      )
      const postMax = Math.max(...post.filter(isFinite))
      const likeMax = Math.max(...likeRaw.filter(isFinite))
      const like    = likeRaw.map(v => (v / likeMax) * postMax * 0.85)

      return { xs, prior, like, post, xLabel: 'θ  (probability of success)', yLabel: 'Density' }
    }

    if (model === 'normal-normal') {
      const { muN, sigN } = posteriorParams as { muN: number; sigN: number }
      const xMin = Math.min(nnMu0 - 3 * nnSig0, muN - 3 * sigN) - 1
      const xMax = Math.max(nnMu0 + 3 * nnSig0, muN + 3 * sigN) + 1
      const xs   = linspace(xMin, xMax, N)
      const prior = xs.map(x => normalPDF(x, nnMu0, nnSig0))
      const post  = xs.map(x => normalPDF(x, muN,   sigN))

      // Likelihood: product of Normals evaluated at obs mean (summary)
      const n    = nnObs.length
      const xbar = n > 0 ? nnObs.reduce((s, x) => s + x, 0) / n : nnMu0
      const likeRaw = xs.map(x => normalPDF(x, xbar, nnSig / Math.sqrt(Math.max(n, 1))))
      const postMax  = Math.max(...post.filter(isFinite))
      const likeMax  = Math.max(...likeRaw.filter(isFinite))
      const like     = likeRaw.map(v => likeMax > 0 ? (v / likeMax) * postMax * 0.85 : 0)

      return { xs, prior, like, post, xLabel: 'μ  (mean)', yLabel: 'Density' }
    }

    // Gamma-Poisson
    const { postAlpha, postBeta } = posteriorParams as { postAlpha: number; postBeta: number }
    const xMax = Math.max(20, (postAlpha / postBeta) * 3 + 10)
    const xs   = linspace(0.01, xMax, N)
    const prior = xs.map(x => gammaPDF(x, gpAlpha, gpBeta))
    const post  = xs.map(x => gammaPDF(x, postAlpha, postBeta))

    // Likelihood: Gamma form from sumK, n
    const n     = gpCounts.length
    const sumK  = gpCounts.reduce((s, k) => s + k, 0)
    const likeA = sumK + 1
    const likeB = n || 1
    const likeRaw = xs.map(x => gammaPDF(x, likeA, likeB))
    const postMax  = Math.max(...post.filter(isFinite))
    const likeMax  = Math.max(...likeRaw.filter(isFinite))
    const like     = likeRaw.map(v => likeMax > 0 ? (v / likeMax) * postMax * 0.85 : 0)

    return { xs, prior, like, post, xLabel: 'λ  (rate)', yLabel: 'Density' }
  }, [model, bbAlpha, bbBeta, bbN, bbK, posteriorParams, nnMu0, nnSig0, nnSig, nnObs, gpAlpha, gpBeta, gpCounts])

  // ─── 3D surface (posterior ridge as evidence accumulates) ──────────────
  const surface3D = useMemo(() => {
    if (model !== 'beta-binomial') return null

    const N_THETA = 60
    const N_STEPS = 40   // n = 1..40 observations
    const thetas  = linspace(0.005, 0.995, N_THETA)
    const ns      = Array.from({ length: N_STEPS }, (_, i) => i + 1)

    // For each n, use observed k/n ratio to infer k_n
    const obsRate = bbN > 0 ? bbK / bbN : 0.5

    const z = ns.map(n => {
      const kn    = Math.round(n * obsRate)
      const postA = bbAlpha + kn
      const postB = bbBeta  + n - kn
      return thetas.map(theta => {
        const v = betaPDF(theta, postA, postB)
        return isFinite(v) ? Math.min(v, 15) : 0
      })
    })

    return { x: thetas, y: ns, z }
  }, [model, bbAlpha, bbBeta, bbN, bbK])

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const N  = 600
    if (model === 'beta-binomial') {
      const { postA, postB } = posteriorParams as { postA: number; postB: number }
      const priorMean = bbAlpha / (bbAlpha + bbBeta)
      const postMean  = postA  / (postA  + postB)
      const postMode  = postA > 1 && postB > 1 ? (postA - 1) / (postA + postB - 2) : postMean
      const xs   = linspace(0.001, 0.999, N)
      const ys   = xs.map(x => betaPDF(x, postA, postB))
      const lo95 = quantile(xs, ys, 0.025)
      const hi95 = quantile(xs, ys, 0.975)
      const width = hi95 - lo95
      return {
        priorMean: priorMean.toFixed(3),
        postMean:  postMean.toFixed(3),
        postMode:  postMode.toFixed(3),
        lo95, hi95,
        ciWidth: width,
        ci95: `[${lo95.toFixed(3)}, ${hi95.toFixed(3)}]`,
        ciWidthStr: width.toFixed(4),
        updateFormula: `Beta(${bbAlpha}+${bbK}, ${bbBeta}+${bbN - bbK}) = Beta(${postA}, ${postB})`,
      }
    }
    if (model === 'normal-normal') {
      const { muN, sigN } = posteriorParams as { muN: number; sigN: number }
      const lo95 = muN - 1.96 * sigN
      const hi95 = muN + 1.96 * sigN
      const width = hi95 - lo95
      return {
        priorMean: nnMu0.toFixed(3),
        postMean:  muN.toFixed(3),
        postMode:  muN.toFixed(3),
        lo95, hi95,
        ciWidth: width,
        ci95: `[${lo95.toFixed(3)}, ${hi95.toFixed(3)}]`,
        ciWidthStr: width.toFixed(4),
        updateFormula: `N(${muN.toFixed(2)}, ${sigN.toFixed(3)}²)`,
      }
    }
    const { postAlpha, postBeta } = posteriorParams as { postAlpha: number; postBeta: number }
    const postMean = postAlpha / postBeta
    const postMode = postAlpha > 1 ? (postAlpha - 1) / postBeta : 0
    const xs  = linspace(0.01, postMean * 5, N)
    const ys  = xs.map(x => gammaPDF(x, postAlpha, postBeta))
    const lo95 = quantile(xs, ys, 0.025)
    const hi95 = quantile(xs, ys, 0.975)
    const width = hi95 - lo95
    return {
      priorMean: (gpAlpha / gpBeta).toFixed(3),
      postMean:  postMean.toFixed(3),
      postMode:  postMode.toFixed(3),
      lo95, hi95,
      ciWidth: width,
      ci95: `[${lo95.toFixed(3)}, ${hi95.toFixed(3)}]`,
      ciWidthStr: width.toFixed(4),
      updateFormula: `Gamma(${gpAlpha}+${gpCounts.reduce((s, k) => s + k, 0)}, ${gpBeta}+${gpCounts.length})`,
    }
  }, [model, posteriorParams, bbAlpha, bbBeta, bbN, bbK, nnMu0, nnSig0, gpAlpha, gpBeta, gpCounts])

  // ─── CI history recording (called after each simulate) ─────────────────
  const recordCI = useCallback((newN: number, newK: number) => {
    const postA = bbAlpha + newK
    const postB = bbBeta  + (newN - newK)
    if (postA <= 0 || postB <= 0) return
    const xs  = linspace(0.001, 0.999, 400)
    const ys  = xs.map(x => betaPDF(x, postA, postB))
    const lo  = quantile(xs, ys, 0.025)
    const hi  = quantile(xs, ys, 0.975)
    setCiHistory(prev => [...prev, { n: newN, width: +(hi - lo).toFixed(4) }])
  }, [bbAlpha, bbBeta])

  // ─── Simulation ──────────────────────────────────────────────────────────
  const simulate = useCallback((n: number) => {
    if (model === 'beta-binomial') {
      let heads = 0
      const seq: string[] = []
      for (let i = 0; i < n; i++) {
        const hit = Math.random() < bbTrueP
        if (hit) heads++
        seq.push(hit ? 'H' : 'T')
      }
      setBbN(prev => {
        const newN = prev + n
        setBbK(prevK => {
          const newK = prevK + heads
          recordCI(newN, newK)
          return newK
        })
        return newN
      })
      setSimLog(p => [
        ...p.slice(-7),
        `[BB] ${n} flips (p_true=${bbTrueP}) → ${seq.join('')} (${heads} H)`,
      ])
    } else if (model === 'normal-normal') {
      const newObs: number[] = []
      for (let i = 0; i < n; i++) {
        // Box-Muller for N(trueMu, nnSig)
        const u1 = Math.random(), u2 = Math.random()
        const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
        newObs.push(+(nnTrueMu + z * nnSig).toFixed(3))
      }
      setNnObs(p => [...p, ...newObs])
      setSimLog(p => [
        ...p.slice(-7),
        `[NN] ${n} obs (μ_true=${nnTrueMu}): [${newObs.join(', ')}]`,
      ])
    } else {
      const newK: number[] = []
      for (let i = 0; i < n; i++) {
        // Poisson via Knuth algorithm
        const L = Math.exp(-gpTrueLam)
        let k = 0, p = 1
        do { k++; p *= Math.random() } while (p > L)
        newK.push(k - 1)
      }
      setGpCounts(p => [...p, ...newK])
      setSimLog(prev => [
        ...prev.slice(-7),
        `[GP] ${n} obs (λ_true=${gpTrueLam}): [${newK.join(', ')}]`,
      ])
    }
  }, [model, bbTrueP, nnTrueMu, nnSig, gpTrueLam, recordCI])

  const resetData = useCallback(() => {
    setBbN(0); setBbK(0)
    setNnObs([]); setGpCounts([])
    setSimLog([])
    setCiHistory([])
  }, [])

  // ─── Plot data ───────────────────────────────────────────────────────────
  const plotData: object[] = viewMode === '3d' && surface3D
    ? [{
        type: 'surface',
        x: surface3D.x,
        y: surface3D.y,
        z: surface3D.z,
        colorscale: 'Viridis',
        showscale: true,
        colorbar: { title: 'P(θ|D)', titleside: 'right', thickness: 12 },
        contours: { z: { show: true, usecolormap: true, highlightcolor: '#42f462', project: { z: true } } },
      }]
    : [
        {
          x: traces2D.xs, y: traces2D.prior,
          type: 'scatter', mode: 'lines', name: 'Prior  P(θ)',
          line: { color: '#818cf8', width: 2, dash: 'dash' },
        },
        {
          x: traces2D.xs, y: traces2D.like,
          type: 'scatter', mode: 'lines', name: 'Likelihood  P(D|θ)  [scaled]',
          line: { color: '#f59e0b', width: 1.8, dash: 'dot' },
        },
        {
          x: traces2D.xs, y: traces2D.post,
          type: 'scatter', mode: 'lines', name: 'Posterior  P(θ|D)',
          line: { color: '#10b981', width: 2.8 },
          fill: 'tozeroy', fillcolor: 'rgba(16,185,129,0.07)',
        },
      ]

  const plotLayout: object = viewMode === '3d'
    ? {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        margin: { t: 10, b: 10, l: 10, r: 10 },
        scene: {
          xaxis: { title: 'θ', gridcolor: '#374151', zerolinecolor: '#4b5563' },
          yaxis: { title: 'n obs', gridcolor: '#374151', zerolinecolor: '#4b5563' },
          zaxis: { title: 'P(θ|D)', gridcolor: '#374151', zerolinecolor: '#4b5563' },
          bgcolor: '#111827',
        },
        font: { color: '#9ca3af', size: 11 },
      }
    : {
        paper_bgcolor: 'transparent', plot_bgcolor: '#f9fafb',
        margin: { t: 24, b: 48, l: 50, r: 20 },
        xaxis: {
          title: traces2D.xLabel,
          gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db',
          titlefont: { size: 12 },
        },
        yaxis: {
          title: traces2D.yLabel,
          gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db',
          titlefont: { size: 12 },
          rangemode: 'tozero',
        },
        legend: { x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top', bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#e5e7eb', borderwidth: 1 },
        font: { color: '#374151', size: 11 },
        hovermode: 'x unified',
      }

  const currentMeta = MODEL_META.find(m => m.id === model)!

  // ─── Sliders per model ───────────────────────────────────────────────────
  const sliders = model === 'beta-binomial' ? [
    { label: 'Prior α (successes imagined)', val: bbAlpha, set: setBbAlpha, min: 0.5, max: 20, step: 0.5, fmt: (v: number) => v.toFixed(1) },
    { label: 'Prior β (failures imagined)',  val: bbBeta,  set: setBbBeta,  min: 0.5, max: 20, step: 0.5, fmt: (v: number) => v.toFixed(1) },
    { label: 'Observed trials n',            val: bbN,     set: setBbN,     min: 0,   max: 200, step: 1,  fmt: (v: number) => v.toFixed(0) },
    { label: 'Observed successes k',         val: bbK,     set: (v: number) => setBbK(Math.min(v, bbN)), min: 0, max: 200, step: 1, fmt: (v: number) => v.toFixed(0) },
  ] : model === 'normal-normal' ? [
    { label: 'Prior mean μ₀',                val: nnMu0,   set: setNnMu0,   min: -10, max: 10,  step: 0.5, fmt: (v: number) => v.toFixed(1) },
    { label: 'Prior std σ₀',                 val: nnSig0,  set: setNnSig0,  min: 0.1, max: 10,  step: 0.1, fmt: (v: number) => v.toFixed(1) },
    { label: 'Likelihood std σ (known)',      val: nnSig,   set: setNnSig,   min: 0.1, max: 10,  step: 0.1, fmt: (v: number) => v.toFixed(1) },
  ] : [
    { label: 'Prior shape α',                val: gpAlpha, set: setGpAlpha, min: 0.5, max: 20,  step: 0.5, fmt: (v: number) => v.toFixed(1) },
    { label: 'Prior rate β',                 val: gpBeta,  set: setGpBeta,  min: 0.1, max: 10,  step: 0.1, fmt: (v: number) => v.toFixed(1) },
  ]

  const simTrueSlider = model === 'beta-binomial'
    ? { label: 'True p (simulation)',   val: bbTrueP,   set: setBbTrueP,   min: 0.01, max: 0.99, step: 0.01, fmt: (v: number) => v.toFixed(2) }
    : model === 'normal-normal'
    ? { label: 'True μ (simulation)',   val: nnTrueMu,  set: setNnTrueMu,  min: -10,  max: 10,   step: 0.5,  fmt: (v: number) => v.toFixed(1) }
    : { label: 'True λ (simulation)',   val: gpTrueLam, set: setGpTrueLam, min: 0.5,  max: 20,   step: 0.5,  fmt: (v: number) => v.toFixed(1) }

  const dataCount = model === 'beta-binomial' ? bbN
    : model === 'normal-normal' ? nnObs.length
    : gpCounts.length

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">

        {/* Model selector */}
        <div className="p-3 border-b border-gray-100 space-y-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Model</p>
          {MODEL_META.map(m => (
            <button key={m.id} onClick={() => setModel(m.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                model === m.id
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                  : 'hover:bg-gray-50 text-gray-600 border border-transparent'}`}>
              <div className="font-semibold">{m.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{m.desc}</div>
            </button>
          ))}
        </div>

        {/* View mode */}
        <div className="px-3 py-2 border-b border-gray-100 flex gap-2">
          {(['2d', '3d'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              disabled={v === '3d' && model !== 'beta-binomial'}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                viewMode === v
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-200 text-gray-500 hover:border-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed'}`}>
              {v.toUpperCase()}
              {v === '3d' && <span className="ml-1 text-[9px]">(BB only)</span>}
            </button>
          ))}
        </div>

        {/* Prior + Data sliders */}
        <div className="p-3 border-b border-gray-100 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prior + Data</p>
          {sliders.map(s => (
            <div key={s.label}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span>{s.label}</span>
                <span className="font-mono font-semibold text-indigo-600">{s.fmt(s.val)}</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
                onChange={e => s.set(+e.target.value)}
                className="w-full accent-indigo-600" />
            </div>
          ))}
        </div>

        {/* Simulation */}
        <div className="p-3 border-b border-gray-100 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Simulation</p>

          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-0.5">
              <span>{simTrueSlider.label}</span>
              <span className="font-mono font-semibold text-emerald-600">{simTrueSlider.fmt(simTrueSlider.val)}</span>
            </div>
            <input type="range" min={simTrueSlider.min} max={simTrueSlider.max}
              step={simTrueSlider.step} value={simTrueSlider.val}
              onChange={e => simTrueSlider.set(+e.target.value)}
              className="w-full accent-emerald-500" />
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {[1, 5, 10, 50].map(n => (
              <button key={n} onClick={() => simulate(n)}
                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-emerald-50
                           text-emerald-700 hover:bg-emerald-100 border border-emerald-200
                           transition-colors">
                +{n}
              </button>
            ))}
            <button onClick={resetData}
              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-red-50
                         text-red-600 hover:bg-red-100 border border-red-200 transition-colors">
              Reset
            </button>
          </div>

          <div className="text-[10px] text-gray-500">
            Data collected: <span className="font-mono font-semibold text-gray-700">{dataCount}</span>
          </div>

          {simLog.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-2 space-y-0.5 max-h-28 overflow-y-auto">
              {simLog.map((l, i) => (
                <div key={i} className="text-[9px] font-mono text-gray-500 truncate">{l}</div>
              ))}
            </div>
          )}
        </div>

        {/* Posterior stats */}
        <div className="p-3 space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Posterior Stats</p>
          {[
            { label: 'Prior mean',     val: stats.priorMean },
            { label: 'Posterior mean', val: stats.postMean  },
            { label: 'Posterior mode', val: stats.postMode  },
            { label: '95% CI',         val: stats.ci95      },
          ].map(({ label, val }) => (
            <div key={label} className="flex justify-between items-center text-xs">
              <span className="text-gray-500">{label}</span>
              <span className="font-mono font-semibold text-indigo-700 text-[10px]">{val}</span>
            </div>
          ))}

          {/* CI width — the key diagnostic */}
          <div className={`rounded-lg px-2 py-2 border ${
            ciHistory.length > 1 && ciHistory[ciHistory.length - 1].width < ciHistory[0].width
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] font-semibold text-gray-600">95% CI width</span>
              <span className="font-mono font-bold text-sm text-emerald-700">
                {stats.ciWidthStr ?? '—'}
              </span>
            </div>
            {/* Visual CI bar */}
            {stats.lo95 !== undefined && (
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-emerald-400 rounded-full transition-all duration-300"
                  style={{
                    left:  `${(stats.lo95 ?? 0) * 100}%`,
                    width: `${((stats.hi95 ?? 1) - (stats.lo95 ?? 0)) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* CI width history sparkline */}
          {ciHistory.length > 1 && (
            <div>
              <p className="text-[9px] text-gray-400 mb-1">CI width over time</p>
              <svg width="100%" height="40" viewBox={`0 0 220 40`}>
                <rect width={220} height={40} fill="#f9fafb" rx={4} />
                {(() => {
                  const maxW = Math.max(...ciHistory.map(h => h.width))
                  const pts  = ciHistory.map((h, i) => {
                    const x = 4 + (i / (ciHistory.length - 1)) * 212
                    const y = 36 - (h.width / maxW) * 30
                    return `${x.toFixed(1)},${y.toFixed(1)}`
                  })
                  return (
                    <>
                      <polyline points={pts.join(' ')}
                        fill="none" stroke="#10b981" strokeWidth={1.5} />
                      {ciHistory.map((h, i) => {
                        const x = 4 + (i / (ciHistory.length - 1)) * 212
                        const y = 36 - (h.width / maxW) * 30
                        return <circle key={i} cx={x} cy={y} r={2} fill="#10b981" />
                      })}
                      <text x={4} y={10} fontSize={7} fill="#9ca3af">
                        wide → narrow (n={ciHistory[ciHistory.length-1].n})
                      </text>
                    </>
                  )
                })()}
              </svg>
            </div>
          )}
          {ciHistory.length === 0 && (
            <p className="text-[9px] text-gray-400 italic">
              Hit a simulate button to track CI width over time
            </p>
          )}

          <div className="bg-indigo-50 rounded-lg px-2 py-1.5">
            <p className="text-[9px] text-indigo-500 font-semibold uppercase tracking-wide mb-0.5">Update</p>
            <p className="text-[10px] font-mono text-indigo-700 break-all">{stats.updateFormula}</p>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900 text-sm">
              Bayesian Inference — {currentMeta.label}
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
              {viewMode.toUpperCase()}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
              Conjugate
            </span>
          </div>
          <p className="text-xs font-mono text-gray-500 mt-1">
            P(θ|D) ∝ P(D|θ) · P(θ)  {' '}
            {model === 'beta-binomial' && `  → Beta(α+k, β+n−k)`}
            {model === 'normal-normal' && `  → N(μₙ, σₙ²)  where 1/σₙ² = 1/σ₀² + n/σ²`}
            {model === 'gamma-poisson' && `  → Gamma(α+Σk, β+n)`}
          </p>
        </div>

        {/* Educational callout */}
        <div className="mx-5 mt-3 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            {[
              {
                tag: 'Prior  P(θ)',
                color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
                dot: 'bg-indigo-400',
                body: model === 'beta-binomial'
                  ? `Beta(${bbAlpha}, ${bbBeta}) — your belief about the coin's fairness before any flips. α−1 imagined heads, β−1 imagined tails.`
                  : model === 'normal-normal'
                  ? `N(${nnMu0}, ${nnSig0}²) — your belief about the true mean before seeing data.`
                  : `Gamma(${gpAlpha}, ${gpBeta}) — your belief about the event rate λ before any observations.`,
              },
              {
                tag: 'Likelihood  P(D|θ)',
                color: 'bg-amber-50 border-amber-200 text-amber-700',
                dot: 'bg-amber-400',
                body: model === 'beta-binomial'
                  ? `Binomial(${bbN}, θ) — probability of observing exactly ${bbK} successes in ${bbN} trials for a given θ.`
                  : model === 'normal-normal'
                  ? `N(μ, ${nnSig}²) — probability of ${nnObs.length} observations given mean μ (σ=${nnSig} assumed known).`
                  : `Poisson(λ) — probability of observed counts given rate λ. ${gpCounts.length} observations, sum=${gpCounts.reduce((s,k)=>s+k,0)}.`,
              },
              {
                tag: 'Posterior  P(θ|D)',
                color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                dot: 'bg-emerald-400',
                body: model === 'beta-binomial'
                  ? `Beta(${(posteriorParams as {postA:number}).postA}, ${(posteriorParams as {postB:number}).postB}) — updated belief. Mean = ${stats.postMean}. Shifts toward the data.`
                  : model === 'normal-normal'
                  ? `N(${stats.postMean}, ${parseFloat(stats.postMean) > 0 ? '…' : '…'}) — posterior mean ${stats.postMean}. Narrows as n grows.`
                  : `Gamma(${(posteriorParams as {postAlpha:number}).postAlpha}, ${(posteriorParams as {postBeta:number}).postBeta}) — posterior mean = ${stats.postMean}. Add more data to sharpen.`,
              },
            ].map(card => (
              <div key={card.tag} className={`rounded-lg border p-2 ${card.color}`}>
                <div className="flex items-center gap-1 mb-1">
                  <div className={`w-2 h-2 rounded-full ${card.dot}`} />
                  <span className="font-semibold text-[10px]">{card.tag}</span>
                </div>
                <p className="leading-snug">{card.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Plot */}
        <div className="flex-1 p-3 min-h-0">
          <Plot
            data={plotData as object[]}
            layout={{ ...plotLayout, autosize: true }}
            config={{ responsive: true, displayModeBar: true }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* 3D instruction */}
        {viewMode === '3d' && (
          <div className="px-5 pb-3 flex-shrink-0 text-[10px] text-gray-400 text-center">
            Surface shows P(θ | k/n heads) as evidence accumulates (Y axis = n observations).
            The ridge narrows and converges toward the true θ as n → ∞.
            Use the observed k/n ratio as the simulated outcome.
          </div>
        )}
      </main>
    </div>
  )
}
