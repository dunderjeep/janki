'use client'

import { useState } from 'react'
import { PARTICLES, Particle, ParticleType } from '@/data/particles'

// ── Type styles ───────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<ParticleType, { cell: string; badge: string; label: string }> = {
  'up-quark':       { cell: 'bg-violet-50 border-violet-300 hover:bg-violet-100',    badge: 'bg-violet-100 text-violet-700',  label: 'Up Quark' },
  'down-quark':     { cell: 'bg-fuchsia-50 border-fuchsia-300 hover:bg-fuchsia-100', badge: 'bg-fuchsia-100 text-fuchsia-700', label: 'Down Quark' },
  'neutrino':       { cell: 'bg-cyan-50 border-cyan-300 hover:bg-cyan-100',          badge: 'bg-cyan-100 text-cyan-700',       label: 'Neutrino' },
  'charged-lepton': { cell: 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700', label: 'Charged Lepton' },
  'gauge-boson':    { cell: 'bg-orange-50 border-orange-300 hover:bg-orange-100',    badge: 'bg-orange-100 text-orange-700',  label: 'Gauge Boson' },
  'scalar-boson':   { cell: 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100',    badge: 'bg-yellow-100 text-yellow-700',  label: 'Scalar Boson' },
}

const INTERACTION_COLORS: Record<string, string> = {
  strong:           'bg-red-100 text-red-700',
  electromagnetic:  'bg-yellow-100 text-yellow-700',
  weak:             'bg-blue-100 text-blue-700',
  Higgs:            'bg-purple-100 text-purple-700',
}

// Grid positions: 6-column layout (label col + gen1 + gen2 + gen3 + gap + bosons)
const GRID_POS: Record<string, { row: number; col: number }> = {
  up:                 { row: 1, col: 2 },
  charm:              { row: 1, col: 3 },
  top:                { row: 1, col: 4 },
  down:               { row: 2, col: 2 },
  strange:            { row: 2, col: 3 },
  bottom:             { row: 2, col: 4 },
  'electron-neutrino': { row: 3, col: 2 },
  'muon-neutrino':    { row: 3, col: 3 },
  'tau-neutrino':     { row: 3, col: 4 },
  electron:           { row: 4, col: 2 },
  muon:               { row: 4, col: 3 },
  tau:                { row: 4, col: 4 },
  photon:             { row: 1, col: 6 },
  gluon:              { row: 2, col: 6 },
  'z-boson':          { row: 3, col: 6 },
  'w-boson':          { row: 4, col: 6 },
  higgs:              { row: 5, col: 6 },
}

const GRID_COLS = '52px 1fr 1fr 1fr 12px 1fr'
const GRID_MIN_WIDTH = '520px'

// ── ParticleCell ──────────────────────────────────────────────────────────────

interface ParticleCellProps {
  p: Particle
  selected: boolean
  onClick: () => void
  gridRow: number
  gridCol: number
}

function ParticleCell({ p, selected, onClick, gridRow, gridCol }: ParticleCellProps) {
  const styles = TYPE_STYLES[p.type]
  return (
    <button
      onClick={onClick}
      title={p.name}
      style={{ gridRow, gridColumn: gridCol }}
      className={[
        'relative flex flex-col items-center justify-between border rounded',
        'px-0.5 py-0.5 cursor-pointer transition-all duration-100',
        'text-left overflow-hidden',
        styles.cell,
        selected
          ? 'ring-2 ring-indigo-500 ring-offset-1 z-10 scale-105 shadow-md'
          : 'hover:scale-105 hover:z-10 hover:shadow-sm',
      ].join(' ')}
    >
      {/* Charge */}
      <span className="self-start text-[8px] leading-none opacity-60 font-mono">
        {p.charge}
      </span>

      {/* Symbol */}
      <span className="text-[14px] font-bold leading-none mt-0.5">
        {p.symbol}
      </span>

      {/* Name */}
      <span className="text-[7px] leading-none opacity-70 truncate w-full text-center mt-0.5">
        {p.name}
      </span>

      {/* Mass */}
      <span className="text-[7px] leading-none opacity-50 font-mono mt-0.5 truncate w-full text-center">
        {p.mass}
      </span>
    </button>
  )
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

interface DetailPanelProps {
  p: Particle
  onClose: () => void
}

function DetailPanel({ p, onClose }: DetailPanelProps) {
  const styles = TYPE_STYLES[p.type]
  const generationLabel = p.generation != null ? `Generation ${p.generation}` : 'N/A (Boson)'

  return (
    <div className="mt-4 border rounded-xl p-5 bg-white shadow-sm relative max-w-2xl">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg leading-none"
        aria-label="Close"
      >
        ×
      </button>

      <div className="flex gap-5 items-start">
        {/* Colored symbol tile */}
        <div
          className={[
            'flex-shrink-0 w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-2',
            styles.cell,
          ].join(' ')}
        >
          <span className="text-[11px] font-mono opacity-60 self-start">{p.charge}</span>
          <span className="text-3xl font-bold leading-none">{p.symbol}</span>
          <span className="text-[10px] font-mono opacity-50 truncate w-full text-center">{p.mass}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.badge}`}>
              {TYPE_STYLES[p.type].label}
            </span>
          </div>

          {/* Properties grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Mass</span>
              <span className="text-gray-700 font-mono text-xs">{p.mass}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Electric Charge</span>
              <span className="text-gray-700">{p.charge}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Spin</span>
              <span className="text-gray-700">{p.spin}</span>
            </div>
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Generation</span>
              <span className="text-gray-700">{generationLabel}</span>
            </div>
            <div className="col-span-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">Antiparticle</span>
              <span className="text-gray-700">{p.antiparticle}</span>
            </div>
            <div className="col-span-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Interactions</span>
              <div className="flex flex-wrap gap-1.5">
                {p.interactions.map(interaction => (
                  <span
                    key={interaction}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${INTERACTION_COLORS[interaction] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {interaction}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed">{p.description}</p>
        </div>
      </div>
    </div>
  )
}

// ── StandardModel ─────────────────────────────────────────────────────────────

export default function StandardModel() {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedParticle = selected ? PARTICLES.find(p => p.id === selected) ?? null : null

  return (
    <div>
      {/* Column headers */}
      <div
        style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: '4px', minWidth: GRID_MIN_WIDTH }}
        className="mb-1"
      >
        <div /> {/* label col spacer */}
        <div className="text-center text-xs font-semibold text-gray-500">Generation I</div>
        <div className="text-center text-xs font-semibold text-gray-500">Generation II</div>
        <div className="text-center text-xs font-semibold text-gray-500">Generation III</div>
        <div /> {/* gap col */}
        <div className="text-center text-xs font-semibold text-gray-500">Force Carriers</div>
      </div>

      {/* Main grid */}
      <div className="overflow-x-auto">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLS,
            gridTemplateRows: 'repeat(5, 1fr)',
            gap: '4px',
            minWidth: GRID_MIN_WIDTH,
          }}
        >
          {/* Row labels */}
          <div
            style={{ gridRow: '1 / 3', gridColumn: 1 }}
            className="flex items-center justify-center"
          >
            <span
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
              className="text-[9px] text-gray-400 font-medium tracking-wide"
            >
              QUARKS
            </span>
          </div>
          <div
            style={{ gridRow: '3 / 5', gridColumn: 1 }}
            className="flex items-center justify-center"
          >
            <span
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
              className="text-[9px] text-gray-400 font-medium tracking-wide"
            >
              LEPTONS
            </span>
          </div>
          {/* Row 5 label col — empty (Higgs overflow) */}
          <div style={{ gridRow: 5, gridColumn: 1 }} />

          {/* All 17 particles */}
          {PARTICLES.map(p => {
            const pos = GRID_POS[p.id]
            if (!pos) return null
            return (
              <ParticleCell
                key={p.id}
                p={p}
                selected={selected === p.id}
                onClick={() => setSelected(selected === p.id ? null : p.id)}
                gridRow={pos.row}
                gridCol={pos.col}
              />
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedParticle && (
        <DetailPanel p={selectedParticle} onClose={() => setSelected(null)} />
      )}

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.entries(TYPE_STYLES) as [ParticleType, typeof TYPE_STYLES[ParticleType]][]).map(
          ([type, styles]) => (
            <span key={type} className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>
              {styles.label}
            </span>
          )
        )}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-gray-400">
        The Standard Model describes 17 fundamental particles: 12 fermions (6 quarks + 6 leptons) and 5 bosons. Gravitons and dark matter are not included.
      </p>
    </div>
  )
}
