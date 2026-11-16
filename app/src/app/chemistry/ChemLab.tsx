'use client'

import { useState, useCallback, useRef } from 'react'
import { MOLECULES, CATEGORY_LABELS, type MolCategory, type Molecule } from '@/data/molecules'
import { MolViewer2D } from './MolViewer2D'
import { MolViewer3D } from './MolViewer3D'
import { FormulaCalculator } from './FormulaCalculator'

type ViewTab  = '2d' | '3d'
type Style3D  = '3dmol' | 'stick' | 'sphere'
type PanelTab = 'library' | 'smiles' | 'calculator'

interface CompoundInfo {
  cid?: number
  formula?: string
  weight?: number
  iupacName?: string
  canonicalSmiles?: string
  isomericSmiles?: string
  inchi?: string
  logP?: number
  hbDonors?: number
  hbAcceptors?: number
  rotatableBonds?: number
  tpsa?: number
}

const ALL_CATS = Object.keys(CATEGORY_LABELS) as MolCategory[]

export function ChemLab() {
  const [viewTab,   setViewTab]   = useState<ViewTab>('2d')
  const [panelTab,  setPanelTab]  = useState<PanelTab>('library')
  const [style3d,   setStyle3d]   = useState<Style3D>('3dmol')
  const [selectedCat, setSelectedCat] = useState<MolCategory | 'all'>('natural')

  // Active molecule
  const [activeSmiles, setActiveSmiles] = useState(MOLECULES.find(m => m.name === 'Caffeine')!.smiles)
  const [activeName,   setActiveName]   = useState('Caffeine')
  const [customSmiles, setCustomSmiles] = useState('')

  // PubChem data
  const [info,    setInfo]    = useState<CompoundInfo | null>(null)
  const [sdf3d,   setSdf3d]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const lastFetch = useRef('')

  const fetchCompound = useCallback(async (name: string, smiles: string) => {
    const key = name || smiles
    if (key === lastFetch.current) return
    lastFetch.current = key
    setLoading(true)
    setError('')
    setSdf3d(null)
    setInfo(null)

    try {
      const params = name
        ? `name=${encodeURIComponent(name)}`
        : `smiles=${encodeURIComponent(smiles)}`

      const [infoRes, sdf3dRes] = await Promise.allSettled([
        fetch(`/api/chemistry/compound?${params}`).then(r => r.json()),
        fetch(`/api/chemistry/compound?${params}&type=sdf3d`).then(r => r.ok ? r.text() : null),
      ])

      if (infoRes.status === 'fulfilled' && !infoRes.value.error) setInfo(infoRes.value)
      else setError(infoRes.status === 'fulfilled' ? infoRes.value.error : 'Lookup failed')

      if (sdf3dRes.status === 'fulfilled' && sdf3dRes.value) setSdf3d(sdf3dRes.value)
    } finally {
      setLoading(false)
    }
  }, [])

  const pickMolecule = useCallback((mol: Molecule) => {
    setActiveSmiles(mol.smiles)
    setActiveName(mol.name)
    fetchCompound(mol.name, mol.smiles)
  }, [fetchCompound])

  const handleCustomSmiles = useCallback(() => {
    const s = customSmiles.trim()
    if (!s) return
    setActiveSmiles(s)
    setActiveName('')
    fetchCompound('', s)
  }, [customSmiles, fetchCompound])

  // Kick off initial fetch
  const didInit = useRef(false)
  if (!didInit.current) {
    didInit.current = true
    fetchCompound('Caffeine', MOLECULES.find(m => m.name === 'Caffeine')!.smiles)
  }

  const filtered = selectedCat === 'all'
    ? MOLECULES
    : MOLECULES.filter(m => m.category === selectedCat)

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-gray-50">

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">

        {/* Panel tabs */}
        <div className="flex border-b border-gray-200 text-xs font-medium">
          {([
            { id: 'library' as PanelTab,    label: '📚 Library'   },
            { id: 'smiles'  as PanelTab,    label: '✏️ SMILES'    },
            { id: 'calculator' as PanelTab, label: '⚗️ Calculator' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPanelTab(id)}
              className={`flex-1 py-2.5 transition-colors text-[11px] ${
                panelTab === id
                  ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Library */}
        {panelTab === 'library' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Category filter */}
            <div className="p-2 border-b border-gray-100">
              <select
                value={selectedCat}
                onChange={e => setSelectedCat(e.target.value as MolCategory | 'all')}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="all">All Categories</option>
                {ALL_CATS.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            {/* Molecule list */}
            <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.map(mol => (
                <li key={mol.name}>
                  <button
                    onClick={() => pickMolecule(mol)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                      activeName === mol.name
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <p className="font-semibold">{mol.name}</p>
                    <p className="text-gray-400 mt-0.5 line-clamp-1">{mol.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SMILES input */}
        {panelTab === 'smiles' && (
          <div className="p-4 space-y-3 flex-1 overflow-y-auto">
            <p className="text-xs text-gray-500">
              Enter a SMILES string or a molecule name. SMILES notation is the standard text
              representation used in cheminformatics.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">SMILES</label>
              <textarea
                value={customSmiles}
                onChange={e => setCustomSmiles(e.target.value)}
                placeholder="e.g. c1ccccc1  or  CC(=O)Oc1ccccc1C(O)=O"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>
            <button
              onClick={handleCustomSmiles}
              disabled={!customSmiles.trim()}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Draw Structure
            </button>
            <div className="border-t border-gray-100 pt-3 space-y-2 text-xs text-gray-500">
              <p className="font-semibold text-gray-600">Common SMILES patterns:</p>
              {[
                ['Benzene',    'c1ccccc1'],
                ['Carboxyl',   'CC(=O)O'],
                ['Ester',      'CC(=O)OCC'],
                ['Amide',      'CC(=O)N'],
                ['Alkyne',     'C#C'],
              ].map(([name, s]) => (
                <button
                  key={name}
                  onClick={() => setCustomSmiles(s)}
                  className="block w-full text-left hover:text-indigo-600 transition-colors"
                >
                  <span className="font-medium">{name}:</span>{' '}
                  <span className="font-mono text-gray-400">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Formula Calculator */}
        {panelTab === 'calculator' && (
          <div className="p-4 flex-1 overflow-y-auto">
            <FormulaCalculator initialFormula={info?.formula ?? ''} />
          </div>
        )}
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-sm">
              {activeName || 'Custom SMILES'}
              {info?.iupacName && activeName !== info.iupacName && (
                <span className="ml-2 text-xs font-normal text-gray-400">{info.iupacName}</span>
              )}
            </h2>
            <p className="font-mono text-xs text-gray-400 mt-0.5 truncate max-w-lg">{activeSmiles}</p>
          </div>
          {info?.cid && (
            <a
              href={`https://pubchem.ncbi.nlm.nih.gov/compound/${info.cid}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              PubChem CID {info.cid} ↗
            </a>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* View tabs + style controls */}
          <div className="flex items-center gap-3">
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs font-medium">
              {(['2d', '3d'] as ViewTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setViewTab(t)}
                  className={`px-4 py-1.5 transition-colors ${
                    viewTab === t ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t.toUpperCase()} Structure
                </button>
              ))}
            </div>
            {viewTab === '3d' && (
              <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs font-medium">
                {([
                  { id: '3dmol' as Style3D, label: 'Ball+Stick' },
                  { id: 'stick' as Style3D, label: 'Stick'       },
                  { id: 'sphere' as Style3D, label: 'CPK'         },
                ]).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setStyle3d(id)}
                    className={`px-3 py-1.5 transition-colors ${
                      style3d === id ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Structure viewer */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {viewTab === '2d' ? (
              <div className="p-4">
                <MolViewer2D smiles={activeSmiles} />
              </div>
            ) : (
              <div className="p-2">
                <MolViewer3D sdf={sdf3d} loading={loading} style={style3d} />
              </div>
            )}
          </div>

          {/* Properties */}
          {(info || loading) && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
                Molecular Properties
              </h3>
              {loading && !info ? (
                <p className="text-sm text-gray-400 animate-pulse">Fetching from PubChem…</p>
              ) : info ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                  {[
                    { label: 'Formula',          value: info.formula },
                    { label: 'Mol. Weight',       value: info.weight ? `${info.weight.toFixed(3)} g/mol` : undefined },
                    { label: 'LogP',              value: info.logP?.toFixed(2) },
                    { label: 'TPSA',              value: info.tpsa ? `${info.tpsa} Å²` : undefined },
                    { label: 'H-Bond Donors',     value: info.hbDonors?.toString() },
                    { label: 'H-Bond Acceptors',  value: info.hbAcceptors?.toString() },
                    { label: 'Rotatable Bonds',   value: info.rotatableBonds?.toString() },
                    { label: 'PubChem CID',       value: info.cid?.toString() },
                  ].filter(p => p.value !== undefined).map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                      <p className="font-mono text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Lipinski Ro5 badge */}
              {info?.weight && info.logP !== undefined && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Lipinski Rule of Five</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { rule: 'MW ≤ 500', ok: (info.weight ?? 999) <= 500 },
                      { rule: 'LogP ≤ 5', ok: (info.logP  ?? 999) <= 5   },
                      { rule: 'HBD ≤ 5',  ok: (info.hbDonors    ?? 0) <= 5   },
                      { rule: 'HBA ≤ 10', ok: (info.hbAcceptors ?? 0) <= 10  },
                    ].map(({ rule, ok }) => (
                      <span
                        key={rule}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {ok ? '✓' : '✗'} {rule}
                      </span>
                    ))}
                    <span className="text-xs text-gray-400 self-center">
                      {[
                        (info.weight ?? 999) <= 500,
                        (info.logP ?? 999) <= 5,
                        (info.hbDonors ?? 0) <= 5,
                        (info.hbAcceptors ?? 0) <= 10,
                      ].filter(Boolean).length === 4
                        ? '— drug-like by Ro5'
                        : '— violates Ro5'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2">{error}</p>
          )}

          {/* Canonical SMILES + InChI */}
          {info?.canonicalSmiles && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Identifiers</h3>
              {[
                { label: 'Canonical SMILES',  value: info.canonicalSmiles },
                { label: 'Isomeric SMILES',   value: info.isomericSmiles  },
                { label: 'InChI',             value: info.inchi           },
              ].filter(i => i.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="font-mono text-xs text-gray-600 break-all">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
