'use client'

import { useState, useCallback } from 'react'
import { ANATOMY_SYSTEMS, REGION_SYSTEMS, type AnatomyNode, type BodyRegion } from '@/data/anatomy'
import { BodySVG } from './BodySVG'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<1|2|3, string> = {
  1: 'Year 1 priority',
  2: 'Year 1–2',
  3: 'Advanced',
}
const PRIORITY_COLOR: Record<1|2|3, string> = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-blue-100  text-blue-800',
  3: 'bg-gray-100  text-gray-600',
}

// ── System chip (tiny) ────────────────────────────────────────────────────────

function SystemChip({ node, onClick }: { node: AnatomyNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold
                 transition-all hover:scale-105 active:scale-95"
      style={{ backgroundColor: node.color + '22', color: node.color,
               border: `1px solid ${node.color}44` }}>
      {node.emoji && <span>{node.emoji}</span>}
      {node.name.replace(' System', '').replace(' System', '')}
    </button>
  )
}

// ── Anatomy card ──────────────────────────────────────────────────────────────

function AnatomyCard({ node, onClick }: { node: AnatomyNode; onClick: () => void }) {
  const hasChildren = (node.children?.length ?? 0) > 0
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl border border-gray-100 p-4 hover:shadow-md
                 transition-all hover:scale-[1.01] active:scale-[0.99] bg-white group"
      style={{ borderLeftWidth: 4, borderLeftColor: node.color }}>

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {node.emoji && <span className="text-xl">{node.emoji}</span>}
          <div>
            <h3 className="font-bold text-gray-900 text-sm leading-tight">{node.name}</h3>
            <p className="text-[10px] font-mono" style={{ color: node.color }}>{node.tagline}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[node.priority]}`}>
            {PRIORITY_LABEL[node.priority]}
          </span>
          {hasChildren && (
            <span className="text-[9px] text-gray-400">
              {node.children!.length} sub-items →
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2">{node.description}</p>

      {node.clinicalPearl && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          <p className="text-[10px] text-amber-700 line-clamp-1">
            <span className="font-semibold">Pearl: </span>{node.clinicalPearl}
          </p>
        </div>
      )}
    </button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onDrillIn }: { node: AnatomyNode; onDrillIn: () => void }) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="rounded-2xl p-4 mb-4"
        style={{ background: `linear-gradient(135deg, ${node.color}22, ${node.color}08)`,
                 border: `1px solid ${node.color}33` }}>
        <div className="flex items-center gap-3 mb-2">
          {node.emoji && <span className="text-3xl">{node.emoji}</span>}
          <div>
            <h2 className="font-bold text-gray-900 text-base">{node.name}</h2>
            <p className="text-xs font-mono" style={{ color: node.color }}>{node.tagline}</p>
          </div>
        </div>
        <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[node.priority]}`}>
          {PRIORITY_LABEL[node.priority]}
        </span>
      </div>

      <div className="space-y-3">
        {/* Description */}
        <section>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Overview</p>
          <p className="text-xs text-gray-700 leading-relaxed">{node.description}</p>
        </section>

        {/* Function */}
        {node.function && (
          <section>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Function</p>
            <p className="text-xs text-gray-700 leading-relaxed">{node.function}</p>
          </section>
        )}

        {/* Clinical pearl */}
        {node.clinicalPearl && (
          <section className="bg-amber-50 rounded-xl p-3">
            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-1">
              Clinical Pearl (exam focus)
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">{node.clinicalPearl}</p>
          </section>
        )}

        {/* Mnemonic */}
        {node.mnemonic && (
          <section className="bg-purple-50 rounded-xl p-3">
            <p className="text-[9px] font-bold text-purple-600 uppercase tracking-widest mb-1">
              Mnemonic / Memory Aid
            </p>
            <p className="text-xs text-purple-800 leading-relaxed italic">{node.mnemonic}</p>
          </section>
        )}

        {/* Pathologies */}
        {node.pathologies && node.pathologies.length > 0 && (
          <section>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Key Pathologies
            </p>
            <div className="flex flex-wrap gap-1">
              {node.pathologies.map(p => (
                <span key={p} className="text-[9px] px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-medium">
                  {p}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Drill in button */}
        {(node.children?.length ?? 0) > 0 && (
          <button onClick={onDrillIn}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white transition-all
                       hover:brightness-110 active:scale-95"
            style={{ backgroundColor: node.color }}>
            Explore {node.children!.length} sub-structures →
          </button>
        )}
      </div>
    </div>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({ path, onJump }: {
  path: AnatomyNode[]; onJump: (idx: number) => void
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono">
      <button onClick={() => onJump(-1)}
        className="text-gray-400 hover:text-gray-700 font-semibold transition-colors">
        Body
      </button>
      {path.map((node, i) => (
        <span key={node.id} className="flex items-center gap-1">
          <span className="text-gray-300">/</span>
          <button onClick={() => onJump(i)}
            className="font-semibold transition-colors hover:text-gray-900"
            style={{ color: node.color }}>
            {node.name}
          </button>
        </span>
      ))}
    </div>
  )
}

// ── Main lab ──────────────────────────────────────────────────────────────────

export function AnatomyLab() {
  const [path,         setPath]        = useState<AnatomyNode[]>([])
  const [selected,     setSelected]    = useState<AnatomyNode | null>(null)
  const [regionFilter, setRegionFilter]= useState<BodyRegion | null>(null)

  // Current level: top-level systems, or children of last node in path
  const currentNodes: AnatomyNode[] = path.length === 0
    ? ANATOMY_SYSTEMS
    : (path[path.length - 1].children ?? [])

  // Filter by body region if one is active
  const filteredNodes = regionFilter
    ? currentNodes.filter(n => n.bodyRegions.includes(regionFilter))
    : currentNodes

  const drillInto = useCallback((node: AnatomyNode) => {
    setSelected(node)
    if ((node.children?.length ?? 0) > 0) {
      setPath(p => [...p, node])
      setSelected(null)
    }
  }, [])

  const jumpTo = useCallback((idx: number) => {
    setSelected(null)
    if (idx === -1) { setPath([]); setRegionFilter(null); return }
    setPath(p => p.slice(0, idx + 1))
  }, [])

  const handleBodyClick = (region: BodyRegion) => {
    if (regionFilter === region) { setRegionFilter(null); return }
    setRegionFilter(region)
    setPath([])
    setSelected(null)
  }

  // Region filter → quick-navigate to systems in that region
  const regionSystems = regionFilter
    ? ANATOMY_SYSTEMS.filter(s => REGION_SYSTEMS[regionFilter]?.includes(s.id))
    : []

  return (
    <div className="flex h-[calc(100vh-56px-1px)] overflow-hidden bg-gray-50">

      {/* ── Left: Body SVG + region filter ─────────────────────────────── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-1 flex-shrink-0">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            {regionFilter ? `Showing: ${regionFilter}` : 'Click a region'}
          </p>
          {regionFilter && (
            <button onClick={() => setRegionFilter(null)}
              className="text-[9px] text-gray-400 hover:text-gray-700 mb-2 font-semibold">
              × Clear filter
            </button>
          )}
        </div>

        <div className="flex-1 flex items-start justify-center pt-2 px-2 overflow-hidden">
          <BodySVG activeRegion={regionFilter} onRegionClick={handleBodyClick} />
        </div>

        {/* System quick-chips when region selected */}
        {regionFilter && regionSystems.length > 0 && (
          <div className="border-t border-gray-100 px-3 py-3 flex-shrink-0">
            <p className="text-[8px] text-gray-400 uppercase font-bold tracking-widest mb-1.5">
              Systems in {regionFilter}
            </p>
            <div className="flex flex-wrap gap-1">
              {regionSystems.map(s => (
                <SystemChip key={s.id} node={s} onClick={() => {
                  setSelected(s)
                  setPath([])
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Med school priority legend */}
        <div className="border-t border-gray-100 px-3 py-3 flex-shrink-0 space-y-1">
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Priority</p>
          {([1,2,3] as const).map(p => (
            <div key={p} className="flex items-center gap-2">
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLOR[p]}`}>
                P{p}
              </span>
              <span className="text-[8px] text-gray-400">{PRIORITY_LABEL[p]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Centre: current level cards ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Breadcrumb */}
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
          <Breadcrumb path={path} onJump={jumpTo} />
          {path.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {filteredNodes.length} structure{filteredNodes.length !== 1 ? 's' : ''} at this level
            </p>
          )}
        </div>

        {/* Cards grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredNodes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
              <span className="text-4xl mb-3">🔬</span>
              <p>{path.length > 0 ? 'No further sub-structures recorded at this level yet.' : 'Click a body region or select a system.'}</p>
              {path.length > 0 && (
                <button onClick={() => jumpTo(path.length - 2)}
                  className="mt-2 text-xs text-blue-500 hover:underline">
                  ← Go back
                </button>
              )}
            </div>
          )}

          {path.length === 0 && filteredNodes.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                {regionFilter ? `Organ systems — ${regionFilter}` : 'All Organ Systems — Med School Priority Order'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredNodes
                  .slice()
                  .sort((a, b) => a.priority - b.priority)
                  .map(node => (
                    <AnatomyCard key={node.id} node={node}
                      onClick={() => setSelected(s => s?.id === node.id ? null : node)} />
                  ))}
              </div>
            </div>
          )}

          {path.length > 0 && filteredNodes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredNodes.map(node => (
                <AnatomyCard key={node.id} node={node}
                  onClick={() => setSelected(s => s?.id === node.id ? null : node)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: detail panel ──────────────────────────────────────────── */}
      <div className={`flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden flex flex-col
                       transition-all duration-300 ${selected ? 'w-80' : 'w-0'}`}>
        {selected && (
          <div className="w-80 h-full flex flex-col">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Detail</p>
              <button onClick={() => setSelected(null)}
                className="text-gray-300 hover:text-gray-600 text-lg font-light leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <DetailPanel node={selected} onDrillIn={() => drillInto(selected)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
