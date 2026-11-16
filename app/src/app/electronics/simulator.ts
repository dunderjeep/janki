/**
 * Modified Nodal Analysis (MNA) — DC and AC steady-state solver
 *
 * Handles: resistors, capacitors (AC), inductors (AC),
 *          DC/AC voltage sources, current sources, diodes/LEDs (piecewise linear),
 *          and ground references.
 *
 * Returns node voltages and component branch currents.
 */

import type { ComponentType } from '@/data/electronic-components'

export const GND = 'GND'

export interface NetComp {
  id:    string
  type:  ComponentType
  node1: string   // "+" terminal (breadboard node name)
  node2: string   // "−" terminal
  value: number   // R in Ω, C in F, L in H, V in V, I in A, Vf in V
}

export interface SimResult {
  voltages:  Record<string, number>   // V at each node
  currents:  Record<string, number>   // A through each component
  power:     Record<string, number>   // W (|V||I|) for each component
  converged: boolean
  acFreq?:   number                   // Hz if AC source present
}

// ── Nodal analysis helper ───────────────────────────────────────────────────

function gaussElim(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const aug = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r
    }
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

    const pivot = aug[col][col]
    if (Math.abs(pivot) < 1e-14) continue // singular — skip

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = aug[r][col] / pivot
      for (let c2 = col; c2 <= n; c2++) {
        aug[r][c2] -= factor * aug[col][c2]
      }
    }
  }

  return aug.map((row, i) => {
    if (Math.abs(row[i]) < 1e-14) return 0
    return row[n] / row[i]
  })
}

// ── Main solver ─────────────────────────────────────────────────────────────

export function simulate(comps: NetComp[]): SimResult {
  if (comps.length === 0) {
    return { voltages: { GND: 0 }, currents: {}, power: {}, converged: true }
  }

  // Check for AC sources
  const acSources = comps.filter(c => c.type === 'voltage-ac')
  const acFreq = acSources.length > 0 ? 1000 : undefined   // default 1 kHz

  // Collect non-ground nodes
  const nodeSet = new Set<string>()
  for (const c of comps) {
    if (c.node1 !== GND) nodeSet.add(c.node1)
    if (c.node2 !== GND) nodeSet.add(c.node2)
  }
  const nodes   = [...nodeSet]
  const N       = nodes.length
  const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n, i]))
  const idx     = (n: string) => n === GND ? -1 : (nodeIdx[n] ?? -1)

  // Separate voltage sources (MNA requires extra variables)
  const vSrcs = comps.filter(c =>
    c.type === 'voltage-dc' || c.type === 'voltage-ac' || c.type === 'ground'
  )
  const M    = vSrcs.length
  const size = N + M
  if (size === 0) return { voltages: { GND: 0 }, currents: {}, power: {}, converged: true }

  const A = Array.from({ length: size }, () => new Array(size).fill(0))
  const b = new Array<number>(size).fill(0)

  // ── Stamp conductances ─────────────────────────────────────────────────
  for (const c of comps) {
    const ni = idx(c.node1)
    const nj = idx(c.node2)

    let g = 0

    switch (c.type) {
      case 'resistor':
        g = c.value > 0 ? 1 / c.value : 0
        break

      case 'wire':
      case 'switch':
        g = 1e7   // near-ideal short circuit
        break

      case 'capacitor':
        // DC: open circuit. AC: Xc = 1/(2πfC)
        if (acFreq) {
          const xc = 1 / (2 * Math.PI * acFreq * c.value)
          g = 1 / xc
        }
        // else g stays 0 (open)
        break

      case 'inductor':
        // DC: short. AC: XL = 2πfL
        if (acFreq) {
          const xl = 2 * Math.PI * acFreq * c.value
          g = 1 / xl
        } else {
          g = 1e7  // short in DC
        }
        break

      case 'led-red':
      case 'led-green':
      case 'led-blue':
      case 'led-yellow':
      case 'diode':
      case 'zener':
        // Piecewise linear model: 5 Ω after Vf
        // We'll handle in post-processing; stamp as small g for now
        g = 1 / 5   // series resistance
        break

      case 'current-source': {
        // Stamp current injection
        if (ni >= 0) b[ni] += c.value
        if (nj >= 0) b[nj] -= c.value
        continue
      }

      // Voltage sources handled below
      case 'voltage-dc':
      case 'voltage-ac':
      case 'ground':
        continue
    }

    if (g === 0) continue
    if (ni >= 0) A[ni][ni] += g
    if (nj >= 0) A[nj][nj] += g
    if (ni >= 0 && nj >= 0) {
      A[ni][nj] -= g
      A[nj][ni] -= g
    }
  }

  // ── Stamp voltage sources (MNA B/C submatrices) ────────────────────────
  vSrcs.forEach((vs, k) => {
    const ni     = idx(vs.node1)
    const nj     = idx(vs.node2)
    const vIdx   = N + k
    const vsVal  = vs.type === 'ground' ? 0 : vs.value

    if (ni >= 0) { A[ni][vIdx] += 1; A[vIdx][ni] += 1 }
    if (nj >= 0) { A[nj][vIdx] -= 1; A[vIdx][nj] -= 1 }
    b[vIdx] = vsVal
  })

  // ── Solve ──────────────────────────────────────────────────────────────
  const x = gaussElim(A, b)
  if (!x) return { voltages: { GND: 0 }, currents: {}, power: {}, converged: false }

  const voltages: Record<string, number> = { GND: 0 }
  nodes.forEach((n, i) => { voltages[n] = x[i] ?? 0 })

  // ── Compute branch currents ────────────────────────────────────────────
  const currents: Record<string, number> = {}
  const power:    Record<string, number> = {}

  const vSrcCurrIdx = Object.fromEntries(vSrcs.map((vs, k) => [vs.id, N + k]))

  for (const c of comps) {
    const v1 = voltages[c.node1] ?? 0
    const v2 = voltages[c.node2] ?? 0
    const vd = v1 - v2
    let   cur = 0

    switch (c.type) {
      case 'resistor':
        cur = c.value > 0 ? vd / c.value : 0
        break
      case 'wire':
      case 'switch':
        cur = vd * 1e7
        break
      case 'capacitor':
        if (acFreq) {
          const xc = 1 / (2 * Math.PI * acFreq * c.value)
          cur = vd / xc
        }
        break
      case 'inductor':
        if (acFreq) {
          const xl = 2 * Math.PI * acFreq * c.value
          cur = vd / xl
        } else {
          cur = vd * 1e7
        }
        break
      case 'led-red':
      case 'led-green':
      case 'led-blue':
      case 'led-yellow':
      case 'diode':
        // piecewise: off below Vf
        cur = vd > c.value ? (vd - c.value) / 5 : 0
        break
      case 'zener':
        if (vd > 0.7) cur = (vd - 0.7) / 5     // forward
        else if (vd < -c.value) cur = (vd + c.value) / 5  // reverse breakdown
        break
      case 'voltage-dc':
      case 'voltage-ac':
      case 'ground': {
        const xi = vSrcCurrIdx[c.id]
        cur = xi !== undefined ? -(x[xi] ?? 0) : 0
        break
      }
      case 'current-source':
        cur = c.value
        break
    }

    currents[c.id] = cur
    power[c.id]    = Math.abs(vd * cur)
  }

  return { voltages, currents, power, converged: true, acFreq }
}

// ── Waveform generation ─────────────────────────────────────────────────────

export interface WavePoint { t: number; v: number }

/** Generate oscilloscope time-domain waveform for a node */
export function generateWaveform(
  nodeId:  string,
  dcVolt:  number,
  acVolt:  number | undefined,   // peak AC amplitude at this node (if any)
  freq:    number,               // Hz
  points = 200,
): WavePoint[] {
  const T    = 1 / freq
  const span = 3 * T  // show 3 full cycles

  return Array.from({ length: points }, (_, i) => {
    const t = (i / (points - 1)) * span
    const v = acVolt !== undefined
      ? acVolt * Math.sin(2 * Math.PI * freq * t)
      : dcVolt
    return { t, v }
  })
}

/** RC step-response waveform (capacitor charging) */
export function rcStepResponse(
  vSrc: number, R: number, C: number, points = 300,
): WavePoint[] {
  const tau  = R * C
  const span = 5 * tau
  return Array.from({ length: points }, (_, i) => {
    const t = (i / (points - 1)) * span
    const v = vSrc * (1 - Math.exp(-t / tau))
    return { t, v }
  })
}

// ── Node naming from breadboard hole IDs ────────────────────────────────────

const LEFT_COLS  = new Set(['a', 'b', 'c', 'd', 'e'])
const RIGHT_COLS = new Set(['f', 'g', 'h', 'i', 'j'])

export function holeToNode(holeId: string): string {
  if (holeId.startsWith('L+')) return 'RAIL_L_POS'
  if (holeId.startsWith('L-')) return 'RAIL_L_NEG'
  if (holeId.startsWith('R+')) return 'RAIL_R_POS'
  if (holeId.startsWith('R-')) return 'RAIL_R_NEG'

  const col = holeId[0].toLowerCase()
  const row = holeId.slice(1)

  if (LEFT_COLS.has(col))  return `L${row}`
  if (RIGHT_COLS.has(col)) return `R${row}`
  return holeId
}
