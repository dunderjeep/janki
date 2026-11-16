'use client'

import { useState, useCallback, useId } from 'react'
import { Breadboard, type PlacedComp } from './Breadboard'
import { Oscilloscope } from './Oscilloscope'
import { Multimeter }   from './Multimeter'
import { simulate, holeToNode, generateWaveform, rcStepResponse, type SimResult } from './simulator'
import {
  COMPONENT_CATALOG, PRESETS, getComponentDef,
  type ComponentType, type Preset,
} from '@/data/electronic-components'
import { CourseSidebar, LessonGuide, LessonStepBar, useCourseNav } from './CoursePanel'
import { getLessonById } from '@/data/electronics-course'

type Tool = ComponentType | 'select' | 'delete'

interface ValueEditorProps {
  comp: PlacedComp
  onUpdate: (value: number) => void
  onClose:  () => void
  onDelete: () => void
}

const SI_PREFIXES = [
  { label: 'k', mult: 1e3 }, { label: 'M', mult: 1e6 },
  { label: 'm', mult: 1e-3 }, { label: 'µ', mult: 1e-6 },
  { label: 'n', mult: 1e-9 },
]

function fmtVal(v: number, unit: string): string {
  if (v === 0) return `0 ${unit}`
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(3)} M${unit}`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(3)} k${unit}`
  if (abs >= 1)   return `${v.toFixed(3)} ${unit}`
  if (abs >= 1e-3) return `${(v * 1e3).toFixed(3)} m${unit}`
  if (abs >= 1e-6) return `${(v * 1e6).toFixed(3)} µ${unit}`
  return `${(v * 1e9).toFixed(3)} n${unit}`
}

function ValueEditor({ comp, onUpdate, onClose, onDelete }: ValueEditorProps) {
  const def  = getComponentDef(comp.type)
  const [raw, setRaw] = useState(comp.value.toString())

  const parsed = parseFloat(raw)
  const valid  = !isNaN(parsed) && parsed > 0

  return (
    <div className="bg-white border border-indigo-100 rounded-xl shadow-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{def.label}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
      <div className="text-xs text-gray-500">{def.description}</div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {def.label === 'Ground' || def.label === 'Wire' ? 'No value' : `Value (${def.unit})`}
        </label>
        {def.unit && (
          <>
            <div className="flex gap-1 mt-1">
              <input
                type="number"
                value={raw}
                onChange={e => setRaw(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-sm text-gray-500 self-center">{def.unit}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {SI_PREFIXES.map(p => (
                <button key={p.label}
                  onClick={() => { onUpdate(p.mult); setRaw((p.mult).toString()) }}
                  className="px-2 py-0.5 text-[10px] rounded bg-gray-100 hover:bg-indigo-50
                             text-gray-600 hover:text-indigo-600 transition-colors">
                  ×{p.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              Current: {fmtVal(comp.value, def.unit)}
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valid || !def.unit}
          onClick={() => { onUpdate(parsed); onClose() }}
          className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600
                     text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors">
          Apply
        </button>
        <button onClick={onDelete}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50
                     text-red-600 hover:bg-red-100 transition-colors">
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Main lab ──────────────────────────────────────────────────────────────────

export function ElectronicsLab() {
  const idBase = useId()
  const [components, setComponents]   = useState<PlacedComp[]>([])
  const [tool, setTool]               = useState<Tool>('select')
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [pendingType, setPendingType]  = useState<ComponentType | null>(null)
  const [pendingValue, setPendingValue] = useState<number>(1000)
  const [simResult,  setSimResult]    = useState<SimResult | null>(null)
  const [mmMode,     setMmMode]       = useState<'V' | 'A' | 'Ω' | 'P'>('V')
  const [activeTab,  setActiveTab]    = useState<'passive' | 'semiconductor' | 'source' | 'misc'>('passive')
  const [leftPanel,  setLeftPanel]    = useState<'components' | 'course'>('components')
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)

  const { prev: prevLesson, next: nextLesson } = useCourseNav(activeLessonId)

  // ── Component placement ─────────────────────────────────────────────────
  let counter = components.length

  const handlePlaceComp = useCallback((hole1: string, hole2: string) => {
    if (!pendingType) return
    const def = getComponentDef(pendingType)
    const newComp: PlacedComp = {
      id:    `${idBase}-${++counter}`,
      type:  pendingType,
      hole1, hole2,
      value: pendingValue,
      label: def.shortLabel,
    }
    setComponents(prev => [...prev, newComp])
    setSimResult(null)
  }, [pendingType, pendingValue, idBase, counter])

  const handleDeleteComp = useCallback((id: string) => {
    setComponents(prev => prev.filter(c => c.id !== id))
    if (selectedComp === id) setSelectedComp(null)
    setSimResult(null)
  }, [selectedComp])

  const handleUpdateValue = useCallback((id: string, value: number) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, value } : c))
    setSimResult(null)
  }, [])

  const handleSelectTool = (t: Tool) => {
    setTool(t)
    if (t !== 'select' && t !== 'delete') {
      setPendingType(t as ComponentType)
      const def = getComponentDef(t as ComponentType)
      setPendingValue(def.defaultValue)
    } else {
      setPendingType(null)
    }
  }

  // ── Load preset ─────────────────────────────────────────────────────────
  const loadPreset = useCallback((preset: Preset) => {
    setComponents(preset.components.map(p => ({ ...p })))
    setSimResult(null)
    setSelectedComp(null)
    setTool('select')
    setPendingType(null)
  }, [])

  const loadPresetByName = useCallback((name: string) => {
    const p = PRESETS.find(pr => pr.name === name)
    if (p) loadPreset(p)
  }, [loadPreset])

  const handleSelectLesson = useCallback((id: string) => {
    setActiveLessonId(id)
    // Auto-switch back to components palette when lesson is selected
    // (guide appears in right panel)
  }, [])

  // ── Simulation ──────────────────────────────────────────────────────────
  const runSimulation = useCallback(() => {
    const netlist = components.map(c => ({
      id:    c.id,
      type:  c.type,
      node1: holeToNode(c.hole1),
      node2: holeToNode(c.hole2),
      value: c.value,
    }))
    const result = simulate(netlist)
    setSimResult(result)
  }, [components])

  // ── Oscilloscope channels ────────────────────────────────────────────────
  const oChannels = (() => {
    if (!simResult) return []

    const PALETTE = ['#4ade80', '#60a5fa', '#fb923c', '#f472b6']
    const acSrc   = components.find(c => c.type === 'voltage-ac')
    const freq    = simResult.acFreq ?? 1000

    // Show voltage at each unique non-GND node
    const seen = new Set<string>()
    const chans = []

    for (const comp of components) {
      for (const hole of [comp.hole1, comp.hole2]) {
        const node = holeToNode(hole)
        if (node === 'GND' || seen.has(node)) continue
        seen.add(node)

        const dcV  = simResult.voltages[node] ?? 0
        const acV  = acSrc ? dcV : undefined

        const pts  = acSrc
          ? generateWaveform(node, dcV, acV, freq)
          : rcStepResponse(dcV, 1, 1)  // simple flat for DC

        if (Math.abs(dcV) > 0.01 || acSrc) {
          chans.push({
            label:  node,
            color:  PALETTE[chans.length % PALETTE.length],
            points: acSrc ? pts : generateWaveform(node, dcV, undefined, freq),
          })
        }
        if (chans.length >= 4) break
      }
      if (chans.length >= 4) break
    }
    return chans
  })()

  // ── Multimeter data for selected component ───────────────────────────────
  const mmData = (() => {
    if (!simResult || !selectedComp) return {}
    const c    = components.find(c => c.id === selectedComp)
    if (!c)    return {}
    const def  = getComponentDef(c.type)
    const v1   = simResult.voltages[holeToNode(c.hole1)] ?? 0
    const v2   = simResult.voltages[holeToNode(c.hole2)] ?? 0
    const vd   = Math.abs(v1 - v2)
    const cur  = Math.abs(simResult.currents[c.id] ?? 0)
    const res  = cur > 1e-12 ? vd / cur : undefined
    const pwr  = simResult.power[c.id] ?? 0
    return {
      label:      `${def.shortLabel}  ${fmtVal(c.value, def.unit)}`,
      voltage:    vd,
      current:    cur,
      resistance: res,
      power:      pwr,
    }
  })()

  const selComp = selectedComp ? components.find(c => c.id === selectedComp) : null

  // ── Category tabs for palette ────────────────────────────────────────────
  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: 'passive',      label: 'Passive'   },
    { id: 'semiconductor', label: 'Semicon.' },
    { id: 'source',       label: 'Source'    },
    { id: 'misc',         label: 'Misc'      },
  ]

  const paletteComps = COMPONENT_CATALOG.filter(c => c.category === activeTab)

  return (
    <div className="flex h-[calc(100vh-56px-1px)] overflow-hidden bg-gray-50">

      {/* ── Left panel — component palette / course ─────────────────────── */}
      <aside className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-hidden">

        {/* Panel toggle */}
        <div className="flex border-b border-gray-100 text-[10px]">
          <button
            onClick={() => setLeftPanel('components')}
            className={`flex-1 py-2 font-semibold transition-colors ${
              leftPanel === 'components'
                ? 'text-indigo-600 border-b-2 border-indigo-500 -mb-px'
                : 'text-gray-500 hover:text-gray-700'}`}>
            🔧 Components
          </button>
          <button
            onClick={() => setLeftPanel('course')}
            className={`flex-1 py-2 font-semibold transition-colors ${
              leftPanel === 'course'
                ? 'text-indigo-600 border-b-2 border-indigo-500 -mb-px'
                : 'text-gray-500 hover:text-gray-700'}`}>
            📚 Course
          </button>
        </div>

        {leftPanel === 'course' ? (
          <CourseSidebar
            activeLessonId={activeLessonId}
            onSelectLesson={handleSelectLesson}
          />
        ) : (
          <>
            {/* Category tabs */}
            <div className="flex border-b border-gray-100 text-[10px]">
              {TABS.map(t => (
                <button key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex-1 py-1.5 font-semibold transition-colors ${
                    activeTab === t.id
                      ? 'text-indigo-600 border-b-2 border-indigo-500 -mb-px'
                      : 'text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Component list */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {paletteComps.map(def => {
                const isActive = tool === def.type
                return (
                  <button key={def.type}
                    onClick={() => handleSelectTool(def.type)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left
                      transition-all text-xs ${isActive
                        ? `ring-2 ring-indigo-400 ${def.bgClass} font-semibold`
                        : `hover:bg-gray-50 ${def.textClass}`}`}>
                    <span className={`w-7 h-7 flex items-center justify-center rounded
                      text-sm ${def.bgClass} flex-shrink-0`}>
                      {def.icon}
                    </span>
                    <div>
                      <div className={`font-semibold text-[11px] ${isActive ? def.textClass : 'text-gray-700'}`}>
                        {def.label}
                      </div>
                      <div className="text-[9px] text-gray-400">
                        {def.defaultValue !== 0 ? fmtVal(def.defaultValue, def.unit) : def.unit || '—'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Value input for selected component type */}
            {pendingType && getComponentDef(pendingType).unit && (
              <div className="border-t border-gray-100 px-3 py-3 bg-indigo-50 space-y-2">
                <label className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
                  Place value ({getComponentDef(pendingType).unit})
                </label>
                <input
                  type="number"
                  value={pendingValue}
                  onChange={e => setPendingValue(parseFloat(e.target.value) || 0)}
                  className="w-full border border-indigo-200 rounded-lg px-2 py-1 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                />
                <div className="text-[9px] text-indigo-500">
                  Click two holes to place
                </div>
              </div>
            )}

            {/* Tool controls */}
            <div className="border-t border-gray-100 px-2 py-2 flex gap-1">
              <button
                onClick={() => handleSelectTool('select')}
                className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${
                  tool === 'select' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                ↖ Select
              </button>
              <button
                onClick={() => handleSelectTool('delete')}
                className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${
                  tool === 'delete' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                🗑 Delete
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Center — breadboard + toolbar ──────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Presets</span>
          {PRESETS.map(p => (
            <button key={p.name}
              onClick={() => loadPreset(p)}
              className="px-3 py-1 text-xs rounded-full border border-gray-200
                         hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50
                         text-gray-600 transition-colors font-medium">
              {p.name}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={() => { setComponents([]); setSimResult(null); setSelectedComp(null) }}
            className="px-3 py-1 text-xs rounded-lg border border-gray-200
                       hover:border-red-300 hover:text-red-600 text-gray-500 transition-colors">
            Clear Board
          </button>
          <button
            onClick={runSimulation}
            disabled={components.length === 0}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white
                       hover:bg-green-700 disabled:opacity-40 transition-colors">
            ▶ Simulate
          </button>
        </div>

        {/* Lesson step guide bar */}
        {activeLessonId && (
          <LessonStepBar
            lessonId={activeLessonId}
            onClose={() => setActiveLessonId(null)}
            onLoadPreset={loadPresetByName}
          />
        )}

        {/* Status bar */}
        {simResult && (
          <div className={`px-4 py-1.5 text-[11px] font-mono flex items-center gap-3
            ${simResult.converged ? 'bg-green-50 text-green-700 border-b border-green-100'
              : 'bg-red-50 text-red-700 border-b border-red-100'}`}>
            <span>{simResult.converged ? '✓ Simulation converged' : '✗ Simulation failed'}</span>
            {simResult.acFreq && <span>| AC analysis @ {simResult.acFreq} Hz</span>}
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">Click a component to probe it</span>
          </div>
        )}

        {/* Breadboard area */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
            <Breadboard
              components={components}
              voltages={simResult?.voltages}
              currents={simResult?.currents}
              selectedTool={tool}
              selectedComp={selectedComp}
              onPlaceComp={handlePlaceComp}
              onSelectComp={setSelectedComp}
              onDeleteComp={handleDeleteComp}
            />
          </div>

          {/* Legend */}
          {simResult && (
            <div className="ml-4 bg-white rounded-xl border border-gray-100 p-3 text-[10px] space-y-1 self-start">
              <div className="font-semibold text-gray-500 uppercase tracking-wide mb-2">Voltage</div>
              {[12, 9, 5, 3.3, 0].map(v => (
                <div key={v} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{
                    background: v > 0 ? `rgb(${Math.round(59+(v/12)*(239-59))},${Math.round(130+(v/12)*(68-130))},${Math.round(246+(v/12)*(68-246))})` : '#6b7280'
                  }} />
                  <span className="text-gray-500">{v} V</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Right panel — instruments ────────────────────────────────────── */}
      <aside className="w-72 border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Instruments</h2>
          {activeLessonId && (
            <span className="text-[9px] text-indigo-500 font-medium">
              📚 {getLessonById(activeLessonId)?.title}
            </span>
          )}
        </div>

        <div className="p-3 space-y-4">

          {/* ── Lesson Guide ── */}
          {activeLessonId && (
            <div>
              <LessonGuide
                lessonId={activeLessonId}
                onClose={() => setActiveLessonId(null)}
                onLoadPreset={loadPresetByName}
                onLessonComplete={() => {/* progress saved in CoursePanel */}}
              />
              {/* Prev / Next lesson navigation */}
              <div className="flex gap-1 mt-2">
                <button
                  disabled={!prevLesson}
                  onClick={() => prevLesson && setActiveLessonId(prevLesson.id)}
                  className="flex-1 py-1 text-[9px] font-semibold rounded-lg border border-gray-200
                    text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors truncate px-1">
                  ← {prevLesson?.title ?? 'No prev'}
                </button>
                <button
                  disabled={!nextLesson}
                  onClick={() => nextLesson && setActiveLessonId(nextLesson.id)}
                  className="flex-1 py-1 text-[9px] font-semibold rounded-lg border border-gray-200
                    text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors truncate px-1">
                  {nextLesson?.title ?? 'No next'} →
                </button>
              </div>
            </div>
          )}

          {/* ── Open course shortcut when no lesson active ── */}
          {!activeLessonId && (
            <button
              onClick={() => setLeftPanel('course')}
              className="w-full py-2 text-[10px] font-semibold rounded-lg border border-dashed
                border-indigo-200 text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600
                transition-colors flex items-center justify-center gap-1">
              📚 Open course guide
            </button>
          )}

          {/* Oscilloscope */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Oscilloscope
            </p>
            <Oscilloscope channels={oChannels} />
          </div>

          {/* Multimeter */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Multimeter {selComp ? `— ${getComponentDef(selComp.type).label}` : '(select a component)'}
            </p>
            <Multimeter
              voltage={mmData.voltage}
              current={mmData.current}
              resistance={mmData.resistance}
              power={mmData.power}
              label={mmData.label}
              mode={mmMode}
              onModeChange={setMmMode}
            />
          </div>

          {/* Value editor for selected component */}
          {selComp && (
            <ValueEditor
              comp={selComp}
              onUpdate={v => handleUpdateValue(selComp.id, v)}
              onClose={() => setSelectedComp(null)}
              onDelete={() => handleDeleteComp(selComp.id)}
            />
          )}

          {/* Component info panel */}
          {!selComp && pendingType && (
            <div className="bg-indigo-50 rounded-xl p-3 text-xs space-y-1">
              <p className="font-semibold text-indigo-700">
                Placing: {getComponentDef(pendingType).label}
              </p>
              <p className="text-indigo-600">{getComponentDef(pendingType).description}</p>
              <p className="text-indigo-500 text-[10px]">Click hole 1, then hole 2</p>
            </div>
          )}

          {/* Node voltages table */}
          {simResult && simResult.converged && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Node Voltages
              </p>
              <div className="space-y-1">
                {Object.entries(simResult.voltages)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .map(([node, v]) => (
                    <div key={node}
                      className="flex justify-between items-center px-2 py-1 rounded-lg bg-gray-50 text-[10px]">
                      <span className="font-mono text-gray-600">{node}</span>
                      <span className="font-mono font-semibold text-indigo-700">
                        {v.toFixed(3)} V
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Power table */}
          {simResult && simResult.converged && Object.keys(simResult.power).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Power Dissipation
              </p>
              <div className="space-y-1">
                {Object.entries(simResult.power)
                  .filter(([, p]) => p > 1e-9)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, p]) => {
                    const c   = components.find(c => c.id === id)
                    const def = c ? getComponentDef(c.type) : null
                    return (
                      <div key={id}
                        className="flex justify-between items-center px-2 py-1 rounded-lg bg-gray-50 text-[10px]">
                        <span className="font-mono text-gray-600">
                          {def?.shortLabel ?? id}
                        </span>
                        <span className="font-mono font-semibold text-orange-600">
                          {p < 1e-3 ? `${(p * 1e6).toFixed(2)} µW`
                            : p < 1 ? `${(p * 1e3).toFixed(2)} mW`
                            : `${p.toFixed(3)} W`}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
