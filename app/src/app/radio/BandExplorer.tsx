'use client'

import { useState } from 'react'
import { AMATEUR_BANDS, type AmateurBand } from '@/data/radio-bands'

// ── Log-scale frequency ruler ─────────────────────────────────────────────────
const F_MIN = 1.5        // MHz
const F_MAX = 1400       // MHz

function freqToX(f: number, width = 1000): number {
  return ((Math.log10(f) - Math.log10(F_MIN)) /
          (Math.log10(F_MAX) - Math.log10(F_MIN))) * width
}

// Ruler tick marks
const TICKS = [
  2, 3, 4, 5, 7, 10, 14, 18, 21, 24, 28, 50, 100, 144, 220, 430, 1000, 1296,
]

const REGION_LABELS = [
  { label: 'HF  (High Frequency)',   fMid: 10,    desc: '3–30 MHz' },
  { label: 'VHF (Very High Freq.)',  fMid: 90,    desc: '30–300 MHz' },
  { label: 'UHF',                    fMid: 600,   desc: '300 MHz–3 GHz' },
]

export function BandExplorer() {
  const [selected, setSelected] = useState<AmateurBand | null>(AMATEUR_BANDS[4]) // 20m default
  const [hover,    setHover]    = useState<string | null>(null)

  const SVG_W = 1000
  const SVG_H = 110
  const BAND_Y = 40
  const BAND_H = 36

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Spectrum ruler ─────────────────────────────────────────────── */}
      <div className="bg-gray-950 px-4 pt-4 pb-2 flex-shrink-0">
        <p className="text-[10px] font-mono text-green-400 mb-2 uppercase tracking-widest">
          Amateur Radio Spectrum — Canadian Allocations (ISED)
        </p>
        <div className="overflow-x-auto">
          <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}
               className="block min-w-[600px]">
            {/* Background */}
            <rect width={SVG_W} height={SVG_H} fill="#030712" />

            {/* Region labels */}
            {REGION_LABELS.map(r => (
              <text key={r.label}
                x={freqToX(r.fMid, SVG_W)} y={12}
                textAnchor="middle" fontSize={9} fill="#374151" fontFamily="monospace">
                {r.label}
              </text>
            ))}

            {/* Region dividers */}
            {[30, 300].map(f => (
              <line key={f}
                x1={freqToX(f, SVG_W)} y1={16} x2={freqToX(f, SVG_W)} y2={SVG_H}
                stroke="#1f2937" strokeWidth={1} strokeDasharray="3 2" />
            ))}

            {/* Bands */}
            {AMATEUR_BANDS.map(band => {
              const x1 = freqToX(band.fLow,  SVG_W)
              const x2 = freqToX(band.fHigh, SVG_W)
              const w  = Math.max(x2 - x1, 4)
              const isSel = selected?.id === band.id
              const isHov = hover === band.id
              return (
                <g key={band.id}
                   onMouseEnter={() => setHover(band.id)}
                   onMouseLeave={() => setHover(null)}
                   onClick={() => setSelected(band)}
                   style={{ cursor: 'pointer' }}>
                  <rect x={x1} y={BAND_Y} width={w} height={BAND_H}
                    fill={band.color}
                    opacity={isSel ? 1 : isHov ? 0.85 : 0.65}
                    rx={2}
                    style={{ filter: isSel ? `drop-shadow(0 0 6px ${band.color})` : 'none' }}
                  />
                  {w > 20 && (
                    <text x={x1 + w / 2} y={BAND_Y + BAND_H / 2 + 4}
                      textAnchor="middle" fontSize={w > 30 ? 9 : 7}
                      fill="white" fontFamily="monospace" fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {band.name}
                    </text>
                  )}
                  {isSel && (
                    <rect x={x1} y={BAND_Y + BAND_H} width={w} height={2}
                      fill="white" />
                  )}
                </g>
              )
            })}

            {/* Tick marks & labels */}
            {TICKS.map(f => {
              const x = freqToX(f, SVG_W)
              return (
                <g key={f}>
                  <line x1={x} y1={BAND_Y + BAND_H + 2} x2={x} y2={SVG_H - 8}
                    stroke="#374151" strokeWidth={0.5} />
                  <text x={x} y={SVG_H - 1}
                    textAnchor="middle" fontSize={7} fill="#4b5563" fontFamily="monospace">
                    {f >= 1000 ? `${f / 1000}G` : f >= 100 ? `${f}M` : `${f}`}
                  </text>
                </g>
              )
            })}

            {/* MHz label */}
            <text x={SVG_W - 4} y={SVG_H - 1}
              textAnchor="end" fontSize={7} fill="#374151" fontFamily="monospace">MHz</text>
          </svg>
        </div>
      </div>

      {/* ── Band detail panel ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        {selected ? (
          <div className="max-w-4xl space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: selected.color }} />
                  <h2 className="text-xl font-bold text-gray-900">{selected.fullName}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: selected.color + '22', color: selected.color }}>
                    {selected.region}
                  </span>
                  {selected.license === 'advanced-exclusive' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
                      Advanced excl.
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1 font-mono">
                  {selected.fLow} – {selected.fHigh} MHz
                  &nbsp;·&nbsp; λ ≈ {selected.wavelength >= 1
                    ? `${selected.wavelength} m`
                    : `${(selected.wavelength * 100).toFixed(0)} cm`}
                </p>
              </div>
            </div>

            {/* Frequency + antenna quick calc */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Lower edge',    val: `${selected.fLow} MHz`  },
                { label: 'Upper edge',    val: `${selected.fHigh} MHz` },
                { label: '½-wave dipole @ centre',
                  val: `${(142.5 / ((selected.fLow + selected.fHigh) / 2)).toFixed(2)} m` },
                { label: '¼-wave vertical',
                  val: `${(71.25 / ((selected.fLow + selected.fHigh) / 2)).toFixed(2)} m` },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                  <p className="font-mono font-bold text-gray-800">{val}</p>
                </div>
              ))}
            </div>

            {/* Power limits */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">Basic Licence (VA/VE)</p>
                <p className="text-2xl font-bold text-blue-800">{selected.power.basic} W</p>
                <p className="text-xs text-blue-500">PEP (Peak Envelope Power)</p>
              </div>
              <div className="bg-purple-50 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-purple-600 mb-1">Advanced Licence</p>
                <p className="text-2xl font-bold text-purple-800">{selected.power.advanced} W</p>
                <p className="text-xs text-purple-500">PEP maximum</p>
              </div>
            </div>

            {/* Modes */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Permitted Modes
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.modes.map(m => (
                  <span key={m}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                    {m}
                  </span>
                ))}
              </div>
              {selected.notes && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  ⚠ {selected.notes}
                </p>
              )}
            </div>

            {/* Propagation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Propagation
                </p>
                <p className="text-sm text-gray-700">{selected.propagation}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Typical Use
                </p>
                <p className="text-sm text-gray-700">{selected.typical}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Click a band in the spectrum above
          </div>
        )}
      </div>

      {/* ── Band list ───────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 bg-white px-4 py-2 flex gap-2 flex-wrap flex-shrink-0">
        {AMATEUR_BANDS.map(b => (
          <button key={b.id}
            onClick={() => setSelected(b)}
            className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all ${
              selected?.id === b.id ? 'text-white' : 'text-gray-500 hover:text-gray-800'}`}
            style={{
              backgroundColor: selected?.id === b.id ? b.color : `${b.color}22`,
              color:            selected?.id === b.id ? 'white' : b.color,
            }}>
            {b.name}
          </button>
        ))}
      </div>
    </div>
  )
}
