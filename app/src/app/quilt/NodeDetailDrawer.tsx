'use client'

import LinkedPins from '@/components/porcupin/LinkedPins'
import { useState, useEffect } from 'react'
import type { GraphNode, GraphEdge, GraphNodeSummary, GraphEdgeSummary, PropertyDef, ValueEdge } from '@/lib/graphStore'
import Markdown from './Markdown'

/** The type/target pickers only ever read an id and a label. */
type NodeRef = { id: string; label: string }

interface Props {
  node: GraphNode
  allNodes: GraphNodeSummary[]
  allEdges: GraphEdgeSummary[]
  onClose: () => void
  onUpdate: (id: string, patch: Partial<GraphNode>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCreateEdge: (body: { type: string; fromNodeId: string; toNodeId: string; props?: Record<string, unknown> }) => Promise<GraphEdge | null>
  onDeleteEdge: (id: string) => Promise<void>
  /** Narrow the canvas to this node's neighbourhood. */
  onFocus: (id: string) => void
}

export default function NodeDetailDrawer({ node, allNodes, allEdges, onClose, onUpdate, onDelete, onCreateEdge, onDeleteEdge, onFocus }: Props) {
  const [label, setLabel] = useState(node.label)
  const [propsText, setPropsText] = useState(JSON.stringify(node.props, null, 2))
  const [propsError, setPropsError] = useState<string | null>(null)

  // Temporal fields
  const [occurredAt, setOccurredAt] = useState(node.occurredAt ? new Date(node.occurredAt).toISOString().slice(0, 16) : '')
  const [validFrom, setValidFrom] = useState(node.validFrom ? new Date(node.validFrom).toISOString().slice(0, 16) : '')
  const [validTo, setValidTo] = useState(node.validTo ? new Date(node.validTo).toISOString().slice(0, 16) : '')

  // Types / inherited props / values (loaded async)
  const [inheritedProps, setInheritedProps] = useState<PropertyDef[]>([])
  const [values, setValues] = useState<Record<string, ValueEdge>>({})
  const [typeNodes, setTypeNodes] = useState<NodeRef[]>([])

  // Add edge form
  const [newEdgeType, setNewEdgeType] = useState('')
  const [newEdgeTarget, setNewEdgeTarget] = useState('')

  // AI tool
  const [aiTool, setAiTool] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  /** Saved tool output, by tool id — read back from the node's props. */
  const [thinking, setThinking] = useState<Record<string, { text: string; at: string }>>({})

  // Location form
  const [showLocForm, setShowLocForm] = useState(false)
  const [locQuery, setLocQuery] = useState('')
  const [locResults, setLocResults] = useState<{ placeId: string; name: string; formattedAddress: string; lat: number; lng: number; googleTypes: string[] }[]>([])
  const [locEdgeType, setLocEdgeType] = useState('LIVES_AT')
  const [locValidFrom, setLocValidFrom] = useState('')
  const [locValidTo, setLocValidTo] = useState('')
  const [locNotes, setLocNotes] = useState('')

  const props = node.props as Record<string, unknown>
  const kind = props.kind as string | undefined

  // Reload node-specific data when node changes
  useEffect(() => {
    setLabel(node.label)
    setPropsText(JSON.stringify(node.props, null, 2))
    setOccurredAt(node.occurredAt ? new Date(node.occurredAt).toISOString().slice(0, 16) : '')
    setValidFrom(node.validFrom ? new Date(node.validFrom).toISOString().slice(0, 16) : '')
    setValidTo(node.validTo ? new Date(node.validTo).toISOString().slice(0, 16) : '')
    setAiResult('')
    setAiTool(null)
    setThinking(
      ((node.props as Record<string, unknown>)?.thinking ?? {}) as Record<string, { text: string; at: string }>
    )

    if (kind !== 'Type' && kind !== 'Property') {
      // Load types, inherited props, values
      Promise.all([
        fetch(`/api/graph/nodes/${node.id}/types`).then(r => r.json()),
        fetch(`/api/graph/nodes/${node.id}/inherited-properties`).then(r => r.json()),
        fetch(`/api/graph/nodes/${node.id}/values`).then(r => r.json()),
      ]).then(([typesData, propsData, valuesData]) => {
        setTypeNodes(typesData.nodes ?? [])
        setInheritedProps(propsData.properties ?? [])
        setValues(valuesData.values ?? {})
      }).catch(() => {})
    }
  }, [node.id, node.label, node.props, node.occurredAt, node.validFrom, node.validTo, kind])

  const saveLabel = async () => {
    if (label.trim() === node.label) return
    await onUpdate(node.id, { label: label.trim() } as Partial<GraphNode>)
  }

  const saveProps = () => {
    try {
      const parsed = JSON.parse(propsText)
      setPropsError(null)
      onUpdate(node.id, { props: parsed } as Partial<GraphNode>)
    } catch {
      setPropsError('Invalid JSON')
    }
  }

  const saveTemporal = async () => {
    await onUpdate(node.id, {
      occurredAt: occurredAt ? new Date(occurredAt) : null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: validTo ? new Date(validTo) : null,
    } as Partial<GraphNode>)
  }

  const saveValue = async (propDefId: string, value: string | number | boolean | null) => {
    const res = await fetch(`/api/graph/nodes/${node.id}/values/${propDefId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (res.ok) {
      const { edge } = await res.json()
      setValues(prev => ({ ...prev, [propDefId]: edge }))
    }
  }

  const clearValue = async (propDefId: string) => {
    await fetch(`/api/graph/nodes/${node.id}/values/${propDefId}`, { method: 'DELETE' })
    setValues(prev => { const next = { ...prev }; delete next[propDefId]; return next })
  }

  const addType = async (typeNodeId: string) => {
    const res = await fetch('/api/graph/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'HAS_TYPE', fromNodeId: node.id, toNodeId: typeNodeId }),
    })
    if (res.ok) {
      const typeNode = allNodes.find(n => n.id === typeNodeId)
      if (typeNode) setTypeNodes(prev => [...prev, typeNode])
    }
  }

  const addEdge = async () => {
    if (!newEdgeType.trim() || !newEdgeTarget.trim()) return
    await onCreateEdge({ type: newEdgeType.trim(), fromNodeId: node.id, toNodeId: newEdgeTarget.trim() })
    setNewEdgeType('')
    setNewEdgeTarget('')
  }

  /**
   * Run a thinking tool and keep the answer.
   *
   * It used to live in component state and nothing else, so selecting another
   * node threw it away — you could not compare two tools on one idea, or come
   * back to a PMI you ran last week. The result is now written into the node's
   * props under `thinking`, which is the same store as everything else on the
   * node and needs no schema of its own.
   */
  const runAiTool = async (toolId: string) => {
    setAiTool(toolId)
    setAiResult('')
    setAiLoading(true)
    let text = ''
    try {
      const res = await fetch('/api/graph/ai-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id, toolId, label: node.label, props: node.props }),
      })
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value)
        setAiResult(text)
      }
    } finally {
      setAiLoading(false)
      // Saved after the stream completes rather than per chunk: a PATCH per
      // token would be hundreds of writes for one answer.
      if (text.trim()) {
        const nextThinking = { ...thinking, [toolId]: { text, at: new Date().toISOString() } }
        setThinking(nextThinking)
        const nextProps = { ...(node.props as Record<string, unknown>), thinking: nextThinking }
        setPropsText(JSON.stringify(nextProps, null, 2))
        await onUpdate(node.id, { props: nextProps } as Partial<GraphNode>)
      }
    }
  }

  const discardThinking = async (toolId: string) => {
    const next = { ...thinking }
    delete next[toolId]
    setThinking(next)
    if (aiTool === toolId) { setAiTool(null); setAiResult('') }
    const nextProps = { ...(node.props as Record<string, unknown>) }
    if (Object.keys(next).length > 0) nextProps.thinking = next
    else delete nextProps.thinking
    setPropsText(JSON.stringify(nextProps, null, 2))
    await onUpdate(node.id, { props: nextProps } as Partial<GraphNode>)
  }

  const searchPlaces = async () => {
    if (!locQuery.trim()) return
    const res = await fetch('/api/graph/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: locQuery }),
    })
    if (res.ok) {
      const data = await res.json()
      setLocResults(data.places ?? [])
    }
  }

  const addLocation = async (place: typeof locResults[0]) => {
    const res = await fetch('/api/graph/places/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'connect',
        subjectNodeId: node.id,
        place,
        edgeType: locEdgeType,
        validFrom: locValidFrom || undefined,
        validTo: locValidTo || undefined,
        notes: locNotes || undefined,
      }),
    })
    if (res.ok) {
      setShowLocForm(false)
      setLocResults([])
      setLocQuery('')
    }
  }

  // Derive outgoing + incoming edges for this node
  const outEdges = allEdges.filter(e => e.fromNodeId === node.id)
  const inEdges  = allEdges.filter(e => e.toNodeId   === node.id)
  const getNodeLabel = (id: string) => allNodes.find(n => n.id === id)?.label ?? id

  const AI_TOOLS = [
    { id: 'PMI', label: 'PMI', title: 'Plus / Minus / Interesting' },
    { id: 'CAF', label: 'CAF', title: 'Consider All Factors' },
    { id: 'C&S', label: 'C&S', title: 'Consequences & Sequel' },
    { id: 'FIP', label: 'FIP', title: 'First Important Priorities' },
    { id: 'APC', label: 'APC', title: 'Alternatives, Possibilities, Choices' },
    { id: 'OPV', label: 'OPV', title: "Other Points of View" },
    { id: 'AGO', label: 'AGO', title: 'Aims, Goals, Objectives' },
  ]

  return (
    <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="font-semibold text-sm text-gray-900 truncate">Node Detail</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => onFocus(node.id)}
            className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50">
            Focus
          </button>
          <button onClick={() => onDelete(node.id)}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
            Delete
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">

          <LinkedPins graph="quilt" nodeId={node.id} />

          {/* Label */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Label</label>
            <div className="flex gap-2">
              <input value={label} onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveLabel()}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-indigo-400" />
              <button onClick={saveLabel} className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
            </div>
            {kind && <span className="text-xs text-gray-400 mt-1 inline-block">Kind: {kind}</span>}
          </section>

          {/* Types section (non-type, non-property nodes) */}
          {kind !== 'Type' && kind !== 'Property' && (
            <section>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Types</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {typeNodes.map(t => (
                  <span key={t.id} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{t.label}</span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  placeholder="Search type nodes…"
                  list="type-nodes-list"
                  id="type-picker"
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                />
                <datalist id="type-nodes-list">
                  {allNodes.filter(n => n.kind === 'Type').map(n => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </datalist>
                <button onClick={() => {
                  const el = document.getElementById('type-picker') as HTMLInputElement
                  if (el?.value) { addType(el.value); el.value = '' }
                }} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">+</button>
              </div>

              {/* Inherited property values */}
              {inheritedProps.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Property Values</p>
                  <div className="space-y-2">
                    {inheritedProps.map(prop => {
                      const currentVal = values[prop.nodeId]
                      return (
                        <div key={prop.nodeId} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-24 truncate flex-shrink-0" title={prop.description}>{prop.key}</span>
                          <input
                            type={prop.valueType === 'Number' ? 'number' : prop.valueType === 'Boolean' ? 'checkbox' : 'text'}
                            defaultValue={currentVal?.value !== undefined ? String(currentVal.value) : ''}
                            placeholder={prop.valueType}
                            onBlur={e => saveValue(prop.nodeId, e.target.value || null)}
                            className="flex-1 px-2 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                          />
                          {currentVal && (
                            <button onClick={() => clearValue(prop.nodeId)} className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0">×</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Edges section */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Edges</label>

            {outEdges.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-gray-400 mb-1">Outgoing ({outEdges.length})</p>
                {outEdges.slice(0,10).map(e => (
                  <div key={e.id} className="flex items-center gap-1 py-0.5">
                    <span className="text-[10px] font-mono bg-gray-100 px-1 rounded text-gray-600 flex-shrink-0">{e.type}</span>
                    <span className="text-xs text-gray-700 truncate flex-1">→ {getNodeLabel(e.toNodeId)}</span>
                    <button onClick={() => onDeleteEdge(e.id)} className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}

            {inEdges.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-gray-400 mb-1">Incoming ({inEdges.length})</p>
                {inEdges.slice(0,10).map(e => (
                  <div key={e.id} className="flex items-center gap-1 py-0.5">
                    <span className="text-[10px] font-mono bg-gray-100 px-1 rounded text-gray-600 flex-shrink-0">{e.type}</span>
                    <span className="text-xs text-gray-700 truncate flex-1">← {getNodeLabel(e.fromNodeId)}</span>
                    <button onClick={() => onDeleteEdge(e.id)} className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add edge form */}
            <div className="border border-dashed border-gray-200 rounded p-2 mt-2">
              <p className="text-[10px] text-gray-400 mb-1">Add edge</p>
              <input value={newEdgeType} onChange={e => setNewEdgeType(e.target.value)}
                placeholder="Edge type (e.g. IS_A)"
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded mb-1 focus:outline-none focus:border-indigo-400"
              />
              <input value={newEdgeTarget} onChange={e => setNewEdgeTarget(e.target.value)}
                placeholder="Target node ID or search…"
                list="all-nodes-list"
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded mb-1 focus:outline-none focus:border-indigo-400"
              />
              <datalist id="all-nodes-list">
                {allNodes.filter(n => n.id !== node.id).map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </datalist>
              <button onClick={addEdge} className="w-full text-xs py-1 bg-gray-800 text-white rounded hover:bg-gray-700">Add</button>
            </div>
          </section>

          {/* Location section (non-type, non-property) */}
          {kind !== 'Type' && kind !== 'Property' && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Locations</label>
                <button onClick={() => setShowLocForm(!showLocForm)} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add</button>
              </div>

              {showLocForm && (
                <div className="border border-gray-200 rounded p-3 space-y-2 mb-2">
                  <select value={locEdgeType} onChange={e => setLocEdgeType(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1">
                    {['LIVES_AT','WORKS_AT','STUDIES_AT','VISITS','LOCATED_AT'].map(t => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <input value={locQuery} onChange={e => setLocQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchPlaces()}
                      placeholder="Search places…"
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                    />
                    <button onClick={searchPlaces} className="text-xs px-2 py-1 bg-green-600 text-white rounded">Search</button>
                  </div>
                  {locResults.map(p => (
                    <button key={p.placeId} onClick={() => addLocation(p)}
                      className="w-full text-left text-xs border border-gray-100 rounded p-1.5 hover:bg-green-50">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-gray-400 truncate">{p.formattedAddress}</div>
                    </button>
                  ))}
                  <div className="grid grid-cols-2 gap-1">
                    <div><label className="text-[10px] text-gray-400">From</label>
                      <input type="date" value={locValidFrom} onChange={e => setLocValidFrom(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded px-1 py-0.5" /></div>
                    <div><label className="text-[10px] text-gray-400">To</label>
                      <input type="date" value={locValidTo} onChange={e => setLocValidTo(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded px-1 py-0.5" /></div>
                  </div>
                  <input value={locNotes} onChange={e => setLocNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none" />
                </div>
              )}
            </section>
          )}

          {/* Temporal fields */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Temporal</label>
            <div className="space-y-1.5">
              {[
                { label: 'Occurred at', value: occurredAt, setter: setOccurredAt },
                { label: 'Valid from',  value: validFrom,  setter: setValidFrom  },
                { label: 'Valid to',    value: validTo,    setter: setValidTo    },
              ].map(({ label: l, value: v, setter }) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 flex-shrink-0">{l}</span>
                  <input type="datetime-local" value={v} onChange={e => setter(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-indigo-400" />
                </div>
              ))}
              <button onClick={saveTemporal} className="w-full text-xs py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 mt-1">Save Temporal</button>
            </div>
          </section>

          {/* Props raw JSON editor */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Raw Props (JSON)</label>
            <textarea value={propsText} onChange={e => setPropsText(e.target.value)} rows={6}
              className="w-full text-xs font-mono border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400 resize-y"
            />
            {propsError && <p className="text-xs text-red-500">{propsError}</p>}
            <button onClick={saveProps} className="w-full text-xs py-1 bg-gray-800 text-white rounded hover:bg-gray-700 mt-1">Save Props</button>
          </section>

          {/* AI Attention Tools */}
          <section>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Thinking Tools</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {AI_TOOLS.map(tool => (
                <button key={tool.id} onClick={() => runAiTool(tool.id)}
                  title={tool.title}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    aiTool === tool.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                  }`}>
                  {tool.label}
                  {thinking[tool.id] && (
                    <span className="ml-1 text-[9px] opacity-70" title="Saved on this node">●</span>
                  )}
                </button>
              ))}
            </div>
            {(() => {
              const shown = aiResult || (aiTool ? thinking[aiTool]?.text : '') || ''
              const savedAt = aiTool ? thinking[aiTool]?.at : undefined
              if (!shown && !aiLoading) return null
              return (
                <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-700 max-h-64 overflow-y-auto">
                  {aiLoading && !shown && <span className="text-gray-400">Thinking…</span>}
                  {shown && <Markdown text={shown} />}
                  {savedAt && !aiLoading && (
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-200">
                      <span className="text-[10px] text-gray-400">
                        saved {new Date(savedAt).toLocaleDateString()}
                      </span>
                      <button onClick={() => aiTool && discardThinking(aiTool)}
                        className="text-[10px] text-gray-400 hover:text-red-500">
                        discard
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </section>

        </div>
      </div>
    </aside>
  )
}
