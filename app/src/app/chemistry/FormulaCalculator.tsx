'use client'

import { useState, useEffect } from 'react'

const MASSES: Record<string, number> = {
  H: 1.008,  C: 12.011, N: 14.007, O: 15.999, S: 32.06,  P: 30.974,
  F: 18.998, Cl: 35.45, Br: 79.904, I: 126.904, Na: 22.990, K: 39.098,
  Ca: 40.078, Mg: 24.305, Fe: 55.845, Si: 28.085, B: 10.81,
}

const ELEMENT_COLORS: Record<string, string> = {
  C: 'bg-gray-700 text-white', H: 'bg-blue-100 text-blue-800',
  O: 'bg-red-100 text-red-800', N: 'bg-indigo-100 text-indigo-800',
  S: 'bg-yellow-100 text-yellow-800', P: 'bg-orange-100 text-orange-800',
  Cl: 'bg-green-100 text-green-800', Br: 'bg-amber-100 text-amber-800',
  F: 'bg-teal-100 text-teal-800', I: 'bg-purple-100 text-purple-800',
}

function parseFormula(formula: string): Record<string, number> {
  const regex = /([A-Z][a-z]?)(\d*)/g
  const atoms: Record<string, number> = {}
  let m
  while ((m = regex.exec(formula)) !== null) {
    const [, el, n] = m
    if (el && el in MASSES) atoms[el] = (atoms[el] ?? 0) + (parseInt(n) || 1)
  }
  return atoms
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }

function computeEmpiricalFormula(atoms: Record<string, number>): string {
  const counts = Object.values(atoms)
  if (!counts.length) return ''
  const g = counts.reduce(gcd)
  return Object.entries(atoms).map(([el, n]) => `${el}${n / g > 1 ? n / g : ''}`).join('')
}

function dbe(atoms: Record<string, number>): number | null {
  const C = atoms.C ?? 0, H = atoms.H ?? 0, N = atoms.N ?? 0
  const X = (atoms.F ?? 0) + (atoms.Cl ?? 0) + (atoms.Br ?? 0) + (atoms.I ?? 0)
  if (!C) return null
  return (2 * C + 2 + N - H - X) / 2
}

export function FormulaCalculator({ initialFormula = '' }: { initialFormula?: string }) {
  const [formula, setFormula] = useState(initialFormula)

  useEffect(() => { setFormula(initialFormula) }, [initialFormula])

  const atoms = parseFormula(formula)
  const mw    = Object.entries(atoms).reduce((s, [el, n]) => s + (MASSES[el] ?? 0) * n, 0)
  const d     = dbe(atoms)
  const emp   = computeEmpiricalFormula(atoms)
  const total = Object.values(atoms).reduce((s, n) => s + n, 0)

  const hasAtoms = Object.keys(atoms).length > 0

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
          Molecular Formula
        </label>
        <input
          value={formula}
          onChange={e => setFormula(e.target.value)}
          placeholder="e.g. C6H12O6"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {hasAtoms && (
        <>
          {/* Atom composition pills */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(atoms).map(([el, n]) => (
              <span
                key={el}
                className={`px-2 py-0.5 rounded text-xs font-semibold ${ELEMENT_COLORS[el] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {el}{n > 1 ? n : ''}
              </span>
            ))}
          </div>

          {/* Key properties grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Mol. Weight',      value: `${mw.toFixed(3)} g/mol` },
              { label: 'Empirical Formula',value: emp },
              { label: 'DBE / Unsaturation',value: d !== null ? (Number.isInteger(d) ? d.toString() : d.toFixed(1)) : 'N/A' },
              { label: 'Total Atoms',      value: total.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="font-mono text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Elemental composition */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Elemental Composition
            </p>
            <div className="space-y-1.5">
              {Object.entries(atoms).map(([el, n]) => {
                const pct = mw > 0 ? ((MASSES[el] ?? 0) * n / mw) * 100 : 0
                return (
                  <div key={el} className="flex items-center gap-2">
                    <span className="w-6 text-xs font-bold text-gray-600">{el}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs font-mono text-gray-600">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* DBE interpretation */}
          {d !== null && (
            <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700">
              <span className="font-semibold">DBE = {d.toFixed(1)}</span>
              {' — '}
              {d === 0 && 'Saturated (no rings or π bonds)'}
              {d === 1 && 'One ring or double bond'}
              {d === 2 && 'Two rings/double bonds — e.g. diene or cyclene'}
              {d === 3 && 'Three — e.g. triple bond or bicyclic'}
              {d === 4 && 'Four — e.g. benzene ring (3 double bonds + 1 ring)'}
              {d > 4 && 'Highly unsaturated — likely aromatic or polycyclic'}
              {d < 0 && 'Check formula — negative DBE invalid'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
