'use client'

import { useState, useMemo } from 'react'
import { MOD_MODES } from '@/data/radio-bands'

// ── Waveform computation ──────────────────────────────────────────────────────

const N = 500

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)))
}

interface WaveData {
  carrier:   number[]
  message:   number[]
  modulated: number[]
  spectrum:  { freq: number; amp: number }[]
  ts:        number[]
}

function computeWaves(
  mode: string,
  fc: number,   // carrier cycles visible
  fm: number,   // message cycles visible
  depth: number // modulation index 0-1
): WaveData {
  const ts = linspace(0, 1, N)
  const carrier   = ts.map(t => Math.cos(2 * Math.PI * fc * t))
  const message   = ts.map(t => Math.cos(2 * Math.PI * fm * t))

  let modulated: number[]
  let spectrum: { freq: number; amp: number }[] = []

  switch (mode) {
    case 'AM':
      modulated = ts.map((t, i) => (1 + depth * message[i]) * carrier[i])
      spectrum = [
        { freq: fc - fm, amp: depth / 2 },
        { freq: fc,      amp: 1 },
        { freq: fc + fm, amp: depth / 2 },
      ]
      break

    case 'SSB': // Upper sideband only
      modulated = ts.map(t => Math.cos(2 * Math.PI * (fc + fm) * t) * depth)
      spectrum = [
        { freq: fc + fm, amp: depth },
      ]
      break

    case 'FM': {
      const beta = depth * 3   // frequency deviation index
      modulated = ts.map(t =>
        Math.cos(2 * Math.PI * fc * t + beta * Math.sin(2 * Math.PI * fm * t))
      )
      // Bessel function approximation — first few sidebands
      spectrum = [
        { freq: fc,      amp: Math.abs(besselJ0(beta)) },
        { freq: fc + fm, amp: Math.abs(besselJ1(beta)) },
        { freq: fc - fm, amp: Math.abs(besselJ1(beta)) },
        { freq: fc + 2 * fm, amp: Math.abs(besselJ2(beta)) * 0.7 },
        { freq: fc - 2 * fm, amp: Math.abs(besselJ2(beta)) * 0.7 },
      ]
      break
    }

    case 'CW':
      // On/off keying at message rate
      modulated = ts.map((t, i) =>
        (message[i] > 0 ? 1 : 0) * carrier[i]
      )
      spectrum = [{ freq: fc, amp: 1 }]
      break

    default:
      modulated = carrier
      spectrum  = [{ freq: fc, amp: 1 }]
  }

  return { carrier, message, modulated, spectrum, ts }
}

// Approximate Bessel functions (first kind)
function besselJ0(x: number): number {
  if (Math.abs(x) < 0.01) return 1
  return Math.cos(x - Math.PI / 4) * Math.sqrt(2 / (Math.PI * Math.abs(x)))
}
function besselJ1(x: number): number {
  if (Math.abs(x) < 0.01) return x / 2
  return Math.cos(x - 3 * Math.PI / 4) * Math.sqrt(2 / (Math.PI * Math.abs(x)))
}
function besselJ2(x: number): number {
  if (Math.abs(x) < 0.01) return x * x / 8
  return Math.cos(x - 5 * Math.PI / 4) * Math.sqrt(2 / (Math.PI * Math.abs(x)))
}

// ── SVG waveform strip ────────────────────────────────────────────────────────

function WaveStrip({
  data, label, color, height = 70,
}: {
  data:   number[]
  label:  string
  color:  string
  height?: number
}) {
  const W = 800
  const pad = 4
  const max = Math.max(...data.map(Math.abs), 1)

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - 2 * pad)
    const y = height / 2 - (v / max) * (height / 2 - pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-mono text-gray-400">{label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full rounded-lg bg-gray-950 border border-gray-800">
        {/* Centreline */}
        <line x1={pad} y1={height / 2} x2={W - pad} y2={height / 2}
          stroke="#1f2937" strokeWidth={0.5} />
        <polyline points={pts} fill="none" strokeWidth={1.2}
          stroke={color}
          style={{ filter: `drop-shadow(0 0 2px ${color}66)` }} />
      </svg>
    </div>
  )
}

// ── Spectrum display ──────────────────────────────────────────────────────────

function SpectrumDisplay({ lines }: { lines: { freq: number; amp: number }[] }) {
  const W = 400; const H = 80
  const maxAmp  = Math.max(...lines.map(l => l.amp), 0.01)
  const allFreqs = lines.map(l => l.freq)
  const fMin = Math.min(...allFreqs) - 2
  const fMax = Math.max(...allFreqs) + 2
  const fRange = fMax - fMin || 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-gray-950 border border-gray-800">
      {/* Baseline */}
      <line x1={0} y1={H - 10} x2={W} y2={H - 10}
        stroke="#1f2937" strokeWidth={0.5} />
      {lines.map((l, i) => {
        const x = ((l.freq - fMin) / fRange) * (W - 20) + 10
        const barH = (l.amp / maxAmp) * (H - 20)
        return (
          <g key={i}>
            <line x1={x} y1={H - 10} x2={x} y2={H - 10 - barH}
              stroke="#4ade80" strokeWidth={3}
              style={{ filter: 'drop-shadow(0 0 3px #4ade8066)' }} />
            <text x={x} y={H - 10 - barH - 3}
              textAnchor="middle" fontSize={7} fill="#4ade80" fontFamily="monospace">
              {l.amp.toFixed(2)}
            </text>
            <text x={x} y={H - 2}
              textAnchor="middle" fontSize={7} fill="#4b5563" fontFamily="monospace">
              f{i}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ModulationLab() {
  const [mode,   setMode]  = useState('AM')
  const [fc,     setFc]    = useState(20)    // carrier freq (display units)
  const [fm,     setFm]    = useState(3)     // message freq
  const [depth,  setDepth] = useState(0.7)   // modulation depth/index

  const waves = useMemo(
    () => computeWaves(mode, fc, fm, depth),
    [mode, fc, fm, depth]
  )

  const modeDef = MOD_MODES.find(m => m.id === mode)

  const modeNotes: Record<string, string> = {
    AM:  'Watch the envelope (outer shape of the modulated wave) trace the message signal.',
    SSB: 'Only one sideband remains — half the bandwidth of AM, same information. Carrier stripped.',
    FM:  'Carrier amplitude stays constant; the frequency wobbles with the message. Immune to static.',
    CW:  'Carrier is switched on/off. The dots and dashes ARE the signal — narrowest possible BW.',
    FT8: 'Modern digital mode — not shown here as a continuous waveform, encoded as data packets.',
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-5">

        {/* Mode selector */}
        <div>
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-2">Mode</p>
          <div className="space-y-1">
            {MOD_MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                  mode === m.id
                    ? 'bg-green-900 border border-green-700 text-green-300'
                    : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}>
                <div className="font-semibold">{m.name}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{m.bandwidth}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Parameters</p>
          {[
            { label: 'Carrier freq (relative)', val: fc,    set: setFc,    min: 5, max: 40, step: 1,    unit: '' },
            { label: 'Message freq (relative)', val: fm,    set: setFm,    min: 1, max: 10, step: 0.5,  unit: '' },
            { label: mode === 'FM' ? 'Mod. index β' : 'Mod. depth',
              val: depth, set: setDepth, min: 0, max: 1,  step: 0.01, unit: '' },
          ].map(s => (
            <div key={s.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{s.label}</span>
                <span className="font-mono text-white">{s.val.toFixed(2)}</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
                onChange={e => s.set(+e.target.value)}
                className="w-full accent-green-400" />
            </div>
          ))}
        </div>

        {/* Mode info */}
        {modeDef && (
          <div className="bg-gray-900 rounded-xl p-3 space-y-2 text-xs">
            <p className="font-semibold text-green-300">{modeDef.fullName}</p>
            <p className="text-gray-400 leading-snug">{modeDef.desc}</p>
            <div className="flex justify-between">
              <span className="text-gray-500">Bandwidth</span>
              <span className="font-mono text-white">{modeDef.bandwidth}</span>
            </div>
            <p className="text-[9px] text-gray-500 italic">{modeDef.typical}</p>
          </div>
        )}
      </div>

      {/* ── Waveforms ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        <div className="bg-gray-900 rounded-xl px-4 py-2 text-xs text-green-300">
          {modeNotes[mode] ?? ''}
        </div>

        <WaveStrip data={waves.message}   label="① Message signal  m(t)"  color="#60a5fa" />
        <WaveStrip data={waves.carrier}   label="② Carrier wave  cos(2πfc·t)" color="#a78bfa" height={55} />
        <WaveStrip data={waves.modulated} label={`③ Modulated output  [${mode}]`} color="#4ade80" height={85} />

        {/* Frequency spectrum */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Frequency Domain (spectrum)
          </p>
          <SpectrumDisplay lines={waves.spectrum} />
          <p className="text-[10px] text-gray-600 mt-1">
            {mode === 'AM'  && 'AM creates two sidebands symmetrically around the carrier. 2/3 of power wasted in carrier.'}
            {mode === 'SSB' && 'SSB discards one sideband and the carrier. All power goes into the information.'}
            {mode === 'FM'  && 'FM sidebands extend (Carson\'s rule: BW ≈ 2(β+1)·fm). More deviation = more sidebands.'}
            {mode === 'CW'  && 'CW is just the carrier — the keying creates narrow sidebands around it.'}
          </p>
        </div>

        {/* Comparison table */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Mode Comparison
          </p>
          <div className="overflow-x-auto">
            <table className="text-[10px] font-mono w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-1 pr-4">Mode</th>
                  <th className="text-left py-1 pr-4">BW</th>
                  <th className="text-left py-1 pr-4">Efficiency</th>
                  <th className="text-left py-1">Typical use</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['CW',  '~150 Hz', '★★★★★', 'DX, QRP, emergency'],
                  ['SSB', '~3 kHz',  '★★★★',  'HF voice standard'],
                  ['AM',  '~6 kHz',  '★★',    'Broadcast, legacy'],
                  ['FM',  '~12 kHz', '★★★',   'VHF/UHF local'],
                  ['FT8', '~50 Hz',  '★★★★★', 'Weak-signal digital'],
                ].map(([m, bw, eff, use]) => (
                  <tr key={m}
                    className={`border-b border-gray-900 ${mode === m ? 'text-green-300' : 'text-gray-400'}`}>
                    <td className="py-1 pr-4 font-bold">{m}</td>
                    <td className="py-1 pr-4">{bw}</td>
                    <td className="py-1 pr-4">{eff}</td>
                    <td className="py-1">{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
