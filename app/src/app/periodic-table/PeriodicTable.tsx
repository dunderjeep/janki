'use client'

import { useState } from 'react'
import { ELEMENTS, ChemElement, ElementCategory } from '@/data/elements'

// Grid position logic
function getPos(el: ChemElement): { row: number; col: number } {
  if (el.number >= 57 && el.number <= 71) return { row: 9, col: 3 + (el.number - 57) }
  if (el.number >= 89 && el.number <= 103) return { row: 10, col: 3 + (el.number - 89) }
  return { row: el.period, col: el.group }
}

const CAT_STYLES: Record<ElementCategory, { cell: string; badge: string }> = {
  'alkali-metal':      { cell: 'bg-red-50 border-red-300 hover:bg-red-100',          badge: 'bg-red-100 text-red-700' },
  'alkaline-earth':    { cell: 'bg-orange-50 border-orange-300 hover:bg-orange-100',  badge: 'bg-orange-100 text-orange-700' },
  'transition-metal':  { cell: 'bg-amber-50 border-amber-300 hover:bg-amber-100',    badge: 'bg-amber-100 text-amber-700' },
  'post-transition':   { cell: 'bg-lime-50 border-lime-300 hover:bg-lime-100',       badge: 'bg-lime-100 text-lime-700' },
  'metalloid':         { cell: 'bg-teal-50 border-teal-300 hover:bg-teal-100',       badge: 'bg-teal-100 text-teal-700' },
  'reactive-nonmetal': { cell: 'bg-sky-50 border-sky-300 hover:bg-sky-100',          badge: 'bg-sky-100 text-sky-700' },
  'noble-gas':         { cell: 'bg-purple-50 border-purple-300 hover:bg-purple-100', badge: 'bg-purple-100 text-purple-700' },
  'lanthanide':        { cell: 'bg-cyan-50 border-cyan-300 hover:bg-cyan-100',       badge: 'bg-cyan-100 text-cyan-700' },
  'actinide':          { cell: 'bg-green-50 border-green-300 hover:bg-green-100',    badge: 'bg-green-100 text-green-700' },
  'unknown':           { cell: 'bg-gray-50 border-gray-300 hover:bg-gray-100',       badge: 'bg-gray-100 text-gray-600' },
}

const CAT_LABELS: Record<ElementCategory, string> = {
  'alkali-metal':      'Alkali Metal',
  'alkaline-earth':    'Alkaline Earth Metal',
  'transition-metal':  'Transition Metal',
  'post-transition':   'Post-transition Metal',
  'metalloid':         'Metalloid',
  'reactive-nonmetal': 'Reactive Nonmetal',
  'noble-gas':         'Noble Gas',
  'lanthanide':        'Lanthanide',
  'actinide':          'Actinide',
  'unknown':           'Unknown',
}

const STATE_ICON: Record<string, string> = {
  solid:   '🧱',
  liquid:  '💧',
  gas:     '💨',
  unknown: '❓',
}

// ── ElementCell ──────────────────────────────────────────────────────────────

interface ElementCellProps {
  el: ChemElement
  selected: boolean
  onClick: () => void
}

function ElementCell({ el, selected, onClick }: ElementCellProps) {
  const { row, col } = getPos(el)
  const styles = CAT_STYLES[el.category]

  return (
    <button
      onClick={onClick}
      title={el.name}
      style={{ gridRow: row, gridColumn: col }}
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
      {/* Atomic number */}
      <span className="self-start text-[8px] leading-none opacity-60 font-mono">
        {el.number}
      </span>

      {/* Symbol */}
      <span className="text-[14px] font-bold leading-none mt-0.5">
        {el.symbol}
      </span>

      {/* Name */}
      <span className="text-[7px] leading-none opacity-70 truncate w-full text-center mt-0.5">
        {el.name}
      </span>

      {/* Mass */}
      <span className="text-[7px] leading-none opacity-50 font-mono mt-0.5">
        {el.mass}
      </span>
    </button>
  )
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

interface DetailPanelProps {
  el: ChemElement
  onClose: () => void
}

function DetailPanel({ el, onClose }: DetailPanelProps) {
  const styles = CAT_STYLES[el.category]
  const groupLabel = el.group === 0
    ? `Period ${el.period}, f-block`
    : `Period ${el.period}, Group ${el.group}`

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
        {/* Colored tile */}
        <div
          className={[
            'flex-shrink-0 w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-2',
            styles.cell,
          ].join(' ')}
        >
          <span className="text-[11px] font-mono opacity-60 self-start">{el.number}</span>
          <span className="text-4xl font-bold leading-none">{el.symbol}</span>
          <span className="text-[10px] font-mono opacity-50">{el.mass}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-gray-900">{el.name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.badge}`}>
              {CAT_LABELS[el.category]}
            </span>
          </div>

          <p className="text-sm text-gray-500 mb-3">{groupLabel}</p>

          <div className="flex flex-wrap gap-4 text-sm mb-3">
            {/* State */}
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">
                State at 25°C
              </span>
              <span className="text-gray-700">
                {STATE_ICON[el.state]}{' '}
                {el.state.charAt(0).toUpperCase() + el.state.slice(1)}
              </span>
            </div>

            {/* Electronegativity */}
            {el.electronegativity !== null && (
              <div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">
                  Electronegativity
                </span>
                <span className="text-gray-700">
                  {el.electronegativity.toFixed(2)} (Pauling)
                </span>
              </div>
            )}

            {/* Atomic mass */}
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-0.5">
                Atomic Mass
              </span>
              <span className="text-gray-700">{el.mass} u</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 leading-relaxed">{el.description}</p>
        </div>
      </div>
    </div>
  )
}

// ── PeriodicTable ─────────────────────────────────────────────────────────────

export default function PeriodicTable() {
  const [selected, setSelected] = useState<number | null>(null)
  const selectedEl = selected != null ? ELEMENTS.find(e => e.number === selected) ?? null : null

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(18, minmax(0, 1fr))',
            gap: '2px',
            minWidth: '900px',
          }}
        >
          {/* Lanthanide placeholder at period 6, group 3 */}
          <div
            style={{ gridRow: 6, gridColumn: 3 }}
            title="Lanthanides (57–71)"
            className="flex items-center justify-center border border-dashed border-cyan-300 rounded text-[9px] text-cyan-400 bg-cyan-50 cursor-default select-none"
          >
            *
          </div>

          {/* Actinide placeholder at period 7, group 3 */}
          <div
            style={{ gridRow: 7, gridColumn: 3 }}
            title="Actinides (89–103)"
            className="flex items-center justify-center border border-dashed border-green-300 rounded text-[9px] text-green-400 bg-green-50 cursor-default select-none"
          >
            **
          </div>

          {/* Spacer between main table and f-block rows */}
          <div style={{ gridRow: 8, gridColumn: '1 / -1' }} className="h-3" />

          {/* Row labels */}
          <div
            style={{ gridRow: 9, gridColumn: '1 / 3' }}
            className="text-[9px] text-gray-400 flex items-center justify-end pr-1"
          >
            Lanthanides
          </div>
          <div
            style={{ gridRow: 10, gridColumn: '1 / 3' }}
            className="text-[9px] text-gray-400 flex items-center justify-end pr-1"
          >
            Actinides
          </div>

          {/* All 118 elements */}
          {ELEMENTS.map(el => (
            <ElementCell
              key={el.number}
              el={el}
              selected={selected === el.number}
              onClick={() => setSelected(selected === el.number ? null : el.number)}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedEl && <DetailPanel el={selectedEl} onClose={() => setSelected(null)} />}

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(CAT_LABELS) as ElementCategory[]).map(cat => (
          <span
            key={cat}
            className={`text-xs px-2 py-0.5 rounded-full ${CAT_STYLES[cat].badge}`}
          >
            {CAT_LABELS[cat]}
          </span>
        ))}
      </div>
    </div>
  )
}
