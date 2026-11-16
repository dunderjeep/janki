'use client'

import 'reactflow/dist/style.css'
import { useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  ReactFlowProvider,
  type Connection,
  type NodeDragHandler,
  type Node  as RFNode,
  type Edge  as RFEdge,
} from 'reactflow'
import { srsNodeTypes, type DeckNodeData, type CardNodeData } from './SrsNodeTypes'
import type { GraphNode, GraphEdge } from '@/lib/graphStore'

// ── Types ──────────────────────────────────────────────────────────────────────

type DeckMeta  = { deckId: string; name: string; active: boolean; total: number; due: number }
type CardMeta  = { cardId: string; deckId: string; front: string; back: string }

export type SrsGraphMode = 'decks' | 'cards'

interface Props {
  mode:      SrsGraphMode
  deckId?:   string
  deckName?: string
}

// ── RF conversion ──────────────────────────────────────────────────────────────

function toRFNode(
  gn: GraphNode,
  meta: DeckMeta | CardMeta | undefined,
): RFNode {
  const ui  = (gn.ui  as { x?: number; y?: number } | null)
  const pos = { x: ui?.x ?? 0, y: ui?.y ?? 0 }

  if (meta && 'deckId' in meta && 'total' in meta) {
    // Deck node
    const dm = meta as DeckMeta
    return {
      id:       gn.id,
      type:     'srsDecNode',
      position: pos,
      data:     { label: dm.name, deckId: dm.deckId, active: dm.active, total: dm.total, due: dm.due } satisfies DeckNodeData,
    }
  }

  if (meta && 'cardId' in meta) {
    // Card node
    const cm = meta as CardMeta
    const label = cm.front.length > 55 ? cm.front.slice(0, 52) + '…' : cm.front
    const back  = cm.back.length  > 55 ? cm.back.slice(0, 52)  + '…' : cm.back
    return {
      id:       gn.id,
      type:     'srsCardNode',
      position: pos,
      data:     { label, back, cardId: cm.cardId, deckId: cm.deckId } satisfies CardNodeData,
    }
  }

  // Fallback: unknown node (foreign deck/card we don't have full meta for)
  const props = gn.props as Record<string, unknown>
  return {
    id:       gn.id,
    type:     'default',
    position: pos,
    data:     { label: gn.label, kind: props.kind },
  }
}

function toRFEdge(ge: GraphEdge): RFEdge {
  const props = ge.props as Record<string, unknown>
  const label = props.label as string | undefined
  return {
    id:          ge.id,
    source:      ge.fromNodeId,
    target:      ge.toNodeId,
    label:       label ?? undefined,
    type:        'default',
    style:       { stroke: '#6366f1', strokeWidth: 1.5 },
    labelStyle:  { fontSize: 10, fill: '#6366f1' },
    labelBgStyle:{ fill: 'white', fillOpacity: 0.85 },
  }
}

// ── Layout algorithms ─────────────────────────────────────────────────────────

/** Place nodes in a tidy grid — fast, always works, ignores edges */
function gridLayout(nodes: RFNode[], cols = 6, spacingX = 300, spacingY = 180): RFNode[] {
  return nodes.map((n, i) => ({
    ...n,
    position: { x: (i % cols) * spacingX + 60, y: Math.floor(i / cols) * spacingY + 60 },
  }))
}

/** Force-directed repulsion + edge attraction — spreads overlapping nodes */
function forceLayout(nodes: RFNode[], edges: RFEdge[], iterations = 120): RFNode[] {
  if (nodes.length === 0) return nodes

  const W = 280, H = 150            // approximate node bounding box
  const REPULSION  = 60_000
  const ATTRACTION = 0.06
  const DAMPING    = 0.82

  // Start from grid if all nodes pile at origin
  const allAtOrigin = nodes.every(n => Math.abs(n.position.x) < 2 && Math.abs(n.position.y) < 2)
  const pos = nodes.map((n, i) => ({
    x: allAtOrigin ? (i % 6) * 320 + 60 : n.position.x,
    y: allAtOrigin ? Math.floor(i / 6) * 190 + 60 : n.position.y,
  }))
  const vel = pos.map(() => ({ x: 0, y: 0 }))

  const edgeIndex = edges.map(e => ({
    si: nodes.findIndex(n => n.id === e.source),
    ti: nodes.findIndex(n => n.id === e.target),
  })).filter(e => e.si >= 0 && e.ti >= 0)

  for (let iter = 0; iter < iterations; iter++) {
    const force = pos.map(() => ({ x: 0, y: 0 }))

    // Pairwise repulsion
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x
        const dy = pos[j].y - pos[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) + 1
        const f = REPULSION / (dist * dist)
        const fx = f * dx / dist, fy = f * dy / dist
        force[i].x -= fx; force[i].y -= fy
        force[j].x += fx; force[j].y += fy
      }
    }

    // Edge attraction
    for (const { si, ti } of edgeIndex) {
      const dx = pos[ti].x - pos[si].x
      const dy = pos[ti].y - pos[si].y
      force[si].x += ATTRACTION * dx; force[si].y += ATTRACTION * dy
      force[ti].x -= ATTRACTION * dx; force[ti].y -= ATTRACTION * dy
    }

    for (let i = 0; i < pos.length; i++) {
      vel[i].x = (vel[i].x + force[i].x) * DAMPING
      vel[i].y = (vel[i].y + force[i].y) * DAMPING
      pos[i].x += vel[i].x
      pos[i].y += vel[i].y
    }
  }

  return nodes.map((n, i) => ({ ...n, position: pos[i] }))
}

// ── Inner canvas (needs ReactFlowProvider above) ───────────────────────────────

function GraphInner({ mode, deckId, deckName }: Props) {
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [truncated,   setTruncated]   = useState(false)
  const [totalCards,  setTotalCards]  = useState(0)

  // Connection label modal
  const [pendingConn,   setPendingConn]   = useState<Connection | null>(null)
  const [connLabel,     setConnLabel]     = useState('')
  const [savingConn,    setSavingConn]    = useState(false)

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([])
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([])

  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragQueue = useRef<Record<string, { x: number; y: number }>>({})

  const [layingOut, setLayingOut] = useState(false)

  // ── Auto-layout ────────────────────────────────────────────────────────────

  function applyLayout(algo: 'grid' | 'force') {
    setLayingOut(true)
    // Defer to next frame so button state updates first
    requestAnimationFrame(() => {
      const laid = algo === 'grid'
        ? gridLayout(flowNodes)
        : forceLayout(flowNodes, flowEdges)
      setFlowNodes(laid)
      // Persist new positions
      for (const n of laid) {
        fetch(`/api/graph/nodes/${n.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ui: n.position }),
        })
      }
      setLayingOut(false)
    })
  }

  // ── Fetch graph data ────────────────────────────────────────────────────────

  const fetchGraph = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = mode === 'decks'
        ? '/api/srs/graph'
        : `/api/srs/graph/deck/${deckId}`
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load graph')

      const metaMap: Record<string, DeckMeta | CardMeta> =
        mode === 'decks' ? data.deckByNodeId : data.cardByNodeId

      const rfNodes: RFNode[] = (data.nodes as GraphNode[]).map((n) => toRFNode(n, metaMap[n.id]))
      const rfEdges: RFEdge[] = (data.edges as GraphEdge[]).map(toRFEdge)

      setFlowNodes(rfNodes)
      setFlowEdges(rfEdges)
      if (mode === 'cards') {
        setTruncated(data.truncated ?? false)
        setTotalCards(data.totalCards ?? 0)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [mode, deckId, setFlowNodes, setFlowEdges])

  useEffect(() => { fetchGraph() }, [fetchGraph])

  // ── Drag → save position ────────────────────────────────────────────────────

  const flushDrag = useCallback(() => {
    const q = dragQueue.current
    dragQueue.current = {}
    for (const [id, pos] of Object.entries(q)) {
      fetch(`/api/graph/nodes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ui: pos }),
      })
    }
  }, [])

  const onNodeDragStop: NodeDragHandler = useCallback((_, rfNode) => {
    dragQueue.current[rfNode.id] = rfNode.position
    if (dragTimer.current) clearTimeout(dragTimer.current)
    dragTimer.current = setTimeout(flushDrag, 500)
  }, [flushDrag])

  // ── Connect edge (opens label modal) ────────────────────────────────────────

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return
    setPendingConn(conn)
    setConnLabel('')
  }, [])

  async function confirmConnect() {
    if (!pendingConn?.source || !pendingConn?.target) return
    setSavingConn(true)
    try {
      const res = await fetch('/api/srs/graph/edges', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fromNodeId: pendingConn.source,
          toNodeId:   pendingConn.target,
          label:      connLabel.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFlowEdges((prev) => [...prev, toRFEdge(data.edge)])
      setPendingConn(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingConn(false)
    }
  }

  // ── Delete selected edges via keyboard (Delete / Backspace) ─────────────────

  const onEdgesDelete = useCallback(async (deleted: RFEdge[]) => {
    for (const edge of deleted) {
      await fetch(`/api/srs/graph/edges/${edge.id}`, { method: 'DELETE' })
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm animate-pulse">
        Loading graph…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={fetchGraph} className="text-sm text-blue-600 hover:underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* Top bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        {mode === 'cards' && deckName && (
          <span className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm">
            {deckName}
          </span>
        )}

        {/* Layout buttons */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <button
            onClick={() => applyLayout('grid')}
            disabled={layingOut}
            title="Grid layout — arrange nodes in equal rows"
            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors border-r border-gray-100"
          >
            ⊞ Grid
          </button>
          <button
            onClick={() => applyLayout('force')}
            disabled={layingOut}
            title="Force layout — repel overlapping nodes, attract connected nodes"
            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {layingOut ? '…' : '⊛ Explode'}
          </button>
        </div>

        {truncated && (
          <span className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5 text-xs text-yellow-800 shadow-sm">
            Showing first 250 of {totalCards} cards
          </span>
        )}
        <span className="bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-400 shadow-sm">
          Drag handle → connect · select edge + Delete to remove
        </span>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={srsNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background gap={24} color="#e5e7eb" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'srsDecNode')  return '#5eead4'
            if (n.type === 'srsCardNode') return '#fcd34d'
            return '#d1d5db'
          }}
          style={{ bottom: 12, right: 12 }}
        />
      </ReactFlow>

      {/* Connection label modal */}
      {pendingConn && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/20">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-5 w-80 flex flex-col gap-3">
            <h3 className="font-semibold text-gray-900">Label this connection</h3>
            <input
              autoFocus
              type="text"
              value={connLabel}
              onChange={(e) => setConnLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmConnect(); if (e.key === 'Escape') setPendingConn(null) }}
              placeholder="e.g. 'builds on', 'prerequisite', 'related'… (optional)"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingConn(null)} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg">
                Cancel
              </button>
              <button
                onClick={confirmConnect}
                disabled={savingConn}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
              >
                {savingConn ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Exported wrapper with ReactFlowProvider ────────────────────────────────────

export function SrsGraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
