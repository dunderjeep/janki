'use client'

import 'reactflow/dist/style.css'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  ReactFlowProvider, useStore,
  type Connection, type NodeDragHandler,
  type Node as RFNode, type Edge as RFEdge,
} from 'reactflow'
import { nodeTypes, PeekActiveContext, OverlayContext } from './customNodes'
import {
  toRFNode, toRFEdge, filterForView, getKindStyle, collapseClusters, buildNodeContext, readUi,
  LOD_EDGE_LABEL_ZOOM, CANVAS_NODE_LIMIT, SCHEMA_CLUSTER,
  buildOverlay, overlayColor, STALE_DAYS,
  type GraphView, type OverlayMode,
} from './graphUtils'
import { useGraphData, useNodeDetail, useClusterStats, useMastery } from './useGraphData'
import NodeDetailDrawer from './NodeDetailDrawer'
import ClusterDetailDrawer from './ClusterDetailDrawer'
import NodePeek, { type PeekTarget } from './NodePeek'
import type { GraphNode } from '@/lib/graphStore'

const SRS_KINDS_ARRAY = ['Card', 'Deck', 'Topic']

const selectShowEdgeLabels = (s: { transform: [number, number, number] }) =>
  s.transform[2] >= LOD_EDGE_LABEL_ZOOM

function GraphCanvas() {
  const [hideSrs, setHideSrs] = useState(false)
  const [showMinimap, setShowMinimap] = useState(false)

  // Focus mode: load one node's neighbourhood instead of the whole graph.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [depth, setDepth] = useState(1)

  // Cluster collapse: decks show an anchor plus a peek of their best-connected
  // members, with the remainder behind a chip.
  const [collapseDecks, setCollapseDecks] = useState(true)
  const [peekCount, setPeekCount] = useState(5)
  const [expandedClusters, setExpandedClusters] = useState<ReadonlySet<string>>(new Set())

  // Labelled cluster boundaries — the layer that says what you're looking at.
  // Suppressed in focus mode, where only part of a cluster is loaded and a frame
  // would enclose mostly empty space.
  const [showFrames, setShowFrames] = useState(true)
  const framesActive = showFrames && !focusId
  const clusterStats = useClusterStats(framesActive)

  const toggleCluster = useCallback((key: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const {
    nodes: dbNodes, edges: dbEdges, loading, error, truncated,
    createNode, updateNode, deleteNode, createEdge, deleteEdge,
  } = useGraphData({
    excludeKinds: hideSrs ? SRS_KINDS_ARRAY : [],
    focusId,
    depth,
  })

  // Study overlay: recolour the canvas by how study has gone rather than by kind.
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('off')
  const mastery = useMastery(overlayMode !== 'off')

  // A frame's caption opens the cluster it names. Held as a key, not an object,
  // so it survives clusterStats refetching.
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null)

  // Hover peek — a read-only preview of whatever the pointer is resting on.
  const [peekEnabled, setPeekEnabled] = useState(true)
  const [peek, setPeek] = useState<PeekTarget | null>(null)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [view, setView] = useState<GraphView>('all')
  const [asOfStr, setAsOfStr] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newNodeLabel, setNewNodeLabel] = useState('')
  const [newNodeKind, setNewNodeKind] = useState('')

  // Full detail is fetched only for the selected node — the canvas itself
  // carries projections without props.
  const { node: selectedNode } = useNodeDetail(selectedId)

  // ?focus=<node id> arrives from a linked photo in Porcupin.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('focus')
    if (id) { setFocusId(id); setSelectedId(id) }
  }, [])

  const asOf = asOfStr ? new Date(asOfStr) : null

  // Focusing a node is an explicit request for what surrounds it, so the SRS
  // filter is suspended there — otherwise focusing a Card blanks the canvas.
  const applyHideSrs = hideSrs && !focusId

  const { nodes: filteredDbNodes, edges: filteredDbEdges } = useMemo(
    () => filterForView(dbNodes, dbEdges, view, asOf, applyHideSrs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dbNodes, dbEdges, view, asOfStr, applyHideSrs]
  )

  // Collapse deck clusters to a peek. Suspended in focus mode — a neighbourhood
  // is already the answer to "show me less".
  const collapseActive = collapseDecks && !focusId

  const collapsed = useMemo(
    () => collapseClusters(filteredDbNodes, filteredDbEdges, {
      enabled: collapseActive,
      expanded: expandedClusters,
      peekCount,
    }),
    [filteredDbNodes, filteredDbEdges, collapseActive, expandedClusters, peekCount]
  )

  const canvasNodes = useMemo(
    () => collapsed.nodes.slice(0, CANVAS_NODE_LIMIT),
    [collapsed.nodes]
  )
  const canvasNodeIds = useMemo(() => new Set(canvasNodes.map(n => n.id)), [canvasNodes])
  const canvasEdges = useMemo(
    () => collapsed.edges.filter(e => canvasNodeIds.has(e.fromNodeId) && canvasNodeIds.has(e.toNodeId)),
    [collapsed.edges, canvasNodeIds]
  )
  const overLimit = collapsed.nodes.length > CANVAS_NODE_LIMIT

  // Edge labels are the single biggest source of SVG churn — drop them when
  // zoomed out, where they're unreadable anyway.
  const showEdgeLabels = useStore(selectShowEdgeLabels)

  // Context lines come from the pre-collapse edge set, or counts would only
  // reflect the edges that survived collapsing.
  const nodeContext = useMemo(
    () => buildNodeContext(filteredDbNodes, filteredDbEdges),
    [filteredDbNodes, filteredDbEdges]
  )

  const overlayValues = useMemo(
    () => (overlayMode === 'off' ? null : buildOverlay(filteredDbNodes, filteredDbEdges, mastery)),
    [overlayMode, filteredDbNodes, filteredDbEdges, mastery]
  )

  const overlayColors = useMemo(() => {
    if (!overlayValues) return null
    const out = new Map<string, string>()
    for (const [id, v] of overlayValues) {
      const c = overlayColor(overlayMode, v)
      if (c) out.set(id, c)
    }
    return out
  }, [overlayValues, overlayMode])

  /** A cluster's own colour: the mean over the cards it holds, not its members' mean. */
  const clusterOverlay = useMemo(() => {
    if (!overlayValues) return null
    const acc = new Map<string, { sum: number; n: number; days: number | null }>()
    for (const n of filteredDbNodes) {
      if (n.kind !== 'Card') continue
      const key = readUi(n.ui).cluster
      const v = overlayValues.get(n.id)
      if (!key || !v) continue
      const a = acc.get(key) ?? { sum: 0, n: 0, days: null }
      if (v.score !== null) { a.sum += v.score; a.n++ }
      if (v.days !== null) a.days = a.days === null ? v.days : Math.min(a.days, v.days)
      acc.set(key, a)
    }
    const out = new Map<string, string>()
    for (const [key, a] of acc) {
      const c = overlayColor(overlayMode, {
        score: a.n > 0 ? a.sum / a.n : null, reps: 0, days: a.days,
      })
      if (c) out.set(key, c)
    }
    return out
  }, [overlayValues, overlayMode, filteredDbNodes])

  const rfNodes: RFNode[] = useMemo(() => {
    const base: RFNode[] = []

    // Frames first so they paint behind the nodes they enclose.
    if (framesActive) {
      // Must stay under CLUSTER_PAD (30 in layout-graph.ts), which is the
      // clearance the cluster packer leaves around each bounding circle.
      // Frames not overlapping is what keeps clamped captions from colliding.
      const pad = 26

      // The single-node clusters are all the same story — a deck whose cards were
      // never imported. Framing and labelling each one put 42 captions 190px apart,
      // which printed over each other. One frame for the block instead.
      const thin = clusterStats.filter(c => c.nodeCount === 1 && c.clusterKey !== SCHEMA_CLUSTER)
      const framed = clusterStats.filter(c => c.nodeCount > 1 && c.clusterKey !== SCHEMA_CLUSTER)

      for (const c of framed) {
        const r = c.radius + pad
        base.push({
          id: `frame:${c.clusterKey}`,
          type: 'clusterFrame',
          position: { x: c.centerX - r, y: c.centerY - r },
          draggable: false,
          selectable: false,
          zIndex: -1,
          // The wrapper ReactFlow puts around a node takes pointer events as soon
          // as any node handler is set, which would lay a click-and-hover surface
          // the size of the whole cluster over the nodes inside it. Turn it off
          // here; ClusterFrameNode re-enables it on the caption alone.
          style: { pointerEvents: 'none' },
          data: {
            clusterKey: c.clusterKey,
            label: c.label,
            cardCount: c.cardCount,
            topicCount: c.topicCount,
            // Only meaningful when SRS genuinely holds more than the graph has.
            missingCards: Math.max(0, (c.srsCardCount ?? 0) - c.cardCount),
            topTopics: c.topTopics,
            overlay: clusterOverlay?.get(c.clusterKey) ?? null,
            width: r * 2,
            height: r * 2,
          },
        })
      }

      if (thin.length > 0) {
        // The thin decks are packed as one circle by the layout, so bound them
        // with a circle that covers all of their centres.
        const cx = (Math.min(...thin.map(c => c.minX)) + Math.max(...thin.map(c => c.maxX))) / 2
        const cy = (Math.min(...thin.map(c => c.minY)) + Math.max(...thin.map(c => c.maxY))) / 2
        const r = Math.max(...thin.map(c => Math.hypot(c.centerX - cx, c.centerY - cy) + c.radius)) + pad
        const missing = thin.reduce((s, c) => s + Math.max(0, (c.srsCardCount ?? 0) - c.cardCount), 0)
        base.push({
          id: 'frame:__thin_block',
          type: 'clusterFrame',
          position: { x: cx - r, y: cy - r },
          draggable: false,
          selectable: false,
          zIndex: -1,
          style: { pointerEvents: 'none' },
          data: {
            clusterKey: '__thin_block',
            label: `${thin.length} decks with no cards in the graph`,
            cardCount: 0,
            topicCount: 0,
            missingCards: missing,
            topTopics: [],
            width: r * 2,
            height: r * 2,
            variant: 'group' as const,
          },
        })
      }
    }

    base.push(...canvasNodes.map(n => toRFNode(n, nodeContext)))
    for (const chip of collapsed.chips) {
      base.push({
        id: `chip:${chip.clusterKey}`,
        type: 'clusterChip',
        position: { x: chip.x, y: chip.y },
        draggable: false,
        selectable: false,
        data: {
          clusterKey: chip.clusterKey,
          hiddenCount: chip.hiddenCount,
          expanded: chip.expanded,
        },
      })
    }
    return base
  }, [canvasNodes, collapsed.chips, nodeContext, clusterStats, framesActive, clusterOverlay])
  const rfEdges: RFEdge[] = useMemo(
    () => canvasEdges.map(e => toRFEdge(e, showEdgeLabels)),
    [canvasEdges, showEdgeLabels]
  )

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(rfNodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => { setFlowNodes(rfNodes) }, [rfNodes, setFlowNodes])
  useEffect(() => { setFlowEdges(rfEdges) }, [rfEdges, setFlowEdges])

  // Long enough that sweeping the pointer across a cluster doesn't strobe popups,
  // short enough to feel like a peek rather than a wait.
  const PEEK_DELAY_MS = 220
  // Grace period on the way out. The popup sits CURSOR_GAP away from the node,
  // so reaching it means leaving the node first — hiding on mouseleave alone
  // would tear the popup down before a click on it could land.
  const PEEK_HIDE_MS = 260

  const cancelPeek = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    if (peekHideTimer.current) clearTimeout(peekHideTimer.current)
    peekTimer.current = null
    peekHideTimer.current = null
    setPeek(null)
  }, [])

  /** Leaving a node starts the close; entering the popup calls it off. */
  const schedulePeekHide = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = null
    if (peekHideTimer.current) clearTimeout(peekHideTimer.current)
    peekHideTimer.current = setTimeout(() => setPeek(null), PEEK_HIDE_MS)
  }, [])

  const holdPeek = useCallback(() => {
    if (peekHideTimer.current) clearTimeout(peekHideTimer.current)
    peekHideTimer.current = null
  }, [])

  useEffect(() => cancelPeek, [cancelPeek])

  // Debounced drag-save: batch position updates, flush after 500 ms idle
  const dragQueue = useRef<Record<string, { x: number; y: number }>>({})
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushDragQueue = useCallback(() => {
    const queue = dragQueue.current
    dragQueue.current = {}
    for (const [id, pos] of Object.entries(queue)) {
      updateNode(id, { ui: pos } as Partial<GraphNode>)
    }
  }, [updateNode])

  const onNodeDragStop: NodeDragHandler = useCallback((_, rfNode) => {
    cancelPeek()
    dragQueue.current[rfNode.id] = rfNode.position
    if (dragTimer.current) clearTimeout(dragTimer.current)
    dragTimer.current = setTimeout(flushDragQueue, 500)
  }, [flushDragQueue, cancelPeek])

  const onNodeMouseEnter = useCallback((event: React.MouseEvent, rfNode: RFNode) => {
    if (!peekEnabled || rfNode.type === 'clusterChip') return

    // Anchor to where the pointer entered rather than tracking it: a popup that
    // follows the cursor is unreadable, and it can never be moved onto.
    const at = { x: event.clientX, y: event.clientY }
    let target: PeekTarget | null = null

    if (rfNode.type === 'clusterFrame') {
      const key = (rfNode.data as { clusterKey: string }).clusterKey
      // The thin-deck block stands for many clusters and has no stats row.
      if (key !== '__thin_block') target = { kind: 'cluster', clusterKey: key, ...at }
    } else {
      target = { kind: 'node', id: rfNode.id, ...at }
    }
    if (!target) return

    if (peekHideTimer.current) clearTimeout(peekHideTimer.current)
    peekHideTimer.current = null
    if (peekTimer.current) clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(() => setPeek(target), PEEK_DELAY_MS)
  }, [peekEnabled])

  const onNodeClick = useCallback((_: React.MouseEvent, rfNode: RFNode) => {
    cancelPeek()
    if (rfNode.type === 'clusterChip') {
      toggleCluster((rfNode.data as { clusterKey: string }).clusterKey)
      return
    }
    if (rfNode.type === 'clusterFrame') {
      const key = (rfNode.data as { clusterKey: string }).clusterKey
      if (key === '__thin_block') return
      setSelectedId(null)
      setSelectedClusterKey(key)
      return
    }
    setSelectedClusterKey(null)
    setSelectedId(rfNode.id)
  }, [toggleCluster, cancelPeek])

  // Double-click a node to re-focus the canvas on it; double-click empty pane to create.
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, rfNode: RFNode) => {
    cancelPeek()
    if (rfNode.type === 'clusterChip') return
    if (rfNode.type === 'clusterFrame') {
      // A frame has no node of its own to focus; focus its deck if one exists.
      const key = (rfNode.data as { clusterKey: string }).clusterKey
      if (dbNodes.some(n => n.id === key)) setFocusId(key)
      return
    }
    setFocusId(rfNode.id)
  }, [cancelPeek, dbNodes])

  const onPaneDoubleClick = useCallback(async (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const wrapper = target.closest('.react-flow__pane')
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const label = window.prompt('Node label:')
    if (!label?.trim()) return
    await createNode({ label: label.trim(), ui: { x, y } })
  }, [createNode])

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target) return
    const type = window.prompt('Edge type (e.g. IS_A, HAS_TYPE):') ?? ''
    if (!type.trim()) return
    await createEdge({ type: type.trim(), fromNodeId: conn.source, toNodeId: conn.target })
  }, [createEdge])

  const handleCreateNode = async () => {
    if (!newNodeLabel.trim()) return
    const props: Record<string, unknown> = {}
    if (newNodeKind) props.kind = newNodeKind
    await createNode({ label: newNodeLabel.trim(), props, ui: { x: 100 + Math.random()*400, y: 100 + Math.random()*300 } })
    setNewNodeLabel('')
    setNewNodeKind('')
  }

  const SIDEBAR_LIMIT = 100
  const visibleDbNodes = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    const source = q ? filteredDbNodes.filter(n => n.label.toLowerCase().includes(q)) : filteredDbNodes
    return source.slice(0, SIDEBAR_LIMIT)
  }, [filteredDbNodes, searchQ])

  const selectedCluster = useMemo(
    () => (selectedClusterKey ? clusterStats.find(c => c.clusterKey === selectedClusterKey) ?? null : null),
    [selectedClusterKey, clusterStats]
  )

  // Frames are the only way in to a cluster, so drop the panel when they go.
  useEffect(() => { if (!framesActive) setSelectedClusterKey(null) }, [framesActive])

  const focusLabel = useMemo(
    () => (focusId ? dbNodes.find(n => n.id === focusId)?.label ?? focusId : null),
    [focusId, dbNodes]
  )

  const VIEW_TABS: { id: GraphView; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'types', label: 'Types' },
    { id: 'entities', label: 'Entities' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] text-gray-400">
      <div className="text-center"><div className="text-3xl mb-2">⬡</div><p className="text-sm">Loading graph…</p></div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] text-red-500 text-sm">{error}</div>
  )

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* Left Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        {/* View tabs */}
        <div className="flex border-b border-gray-200">
          {VIEW_TABS.map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${view === tab.id ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Focus mode */}
        <div className="px-3 py-2 border-b border-gray-100">
          {focusId ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide">Focused</span>
                <button onClick={() => setFocusId(null)}
                  className="text-[10px] text-gray-400 hover:text-gray-600">Show all</button>
              </div>
              <div className="text-xs font-medium text-gray-800 truncate" title={focusLabel ?? ''}>{focusLabel}</div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">Depth</span>
                {[1, 2, 3].map(d => (
                  <button key={d} onClick={() => setDepth(d)}
                    className={`text-[10px] w-5 h-5 rounded transition-colors ${depth === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {d}
                  </button>
                ))}
              </div>
              {truncated && (
                <p className="text-[10px] text-amber-500">Neighbourhood truncated — lower the depth.</p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 leading-snug">
              Showing the whole graph. Double-click a node (or use Focus in the detail panel)
              to load just its neighbourhood.
            </p>
          )}
        </div>

        {/* Cluster collapse */}
        <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
          <label
            title={focusId ? 'Not applied while focused on a node' : 'Show each deck plus a peek of its contents'}
            className={`flex items-center gap-1.5 ${focusId ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={collapseDecks} disabled={Boolean(focusId)}
              onChange={e => setCollapseDecks(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Collapse decks</span>
          </label>
          {collapseActive && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400">Peek</span>
                {[3, 5, 10].map(p => (
                  <button key={p} onClick={() => setPeekCount(p)}
                    className={`text-[10px] px-1.5 h-5 rounded transition-colors ${peekCount === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {p}
                  </button>
                ))}
              </div>
              {expandedClusters.size > 0 && (
                <button onClick={() => setExpandedClusters(new Set())}
                  className="text-[10px] text-gray-400 hover:text-gray-600">
                  Re-collapse {expandedClusters.size} expanded
                </button>
              )}
            </>
          )}
        </div>

        {/* Toggles */}
        <div className="px-3 py-2 border-b border-gray-100 flex gap-3 flex-wrap">
          <label
            title={focusId ? 'Not applied while focused on a node' : 'Hide Card / Deck / Topic nodes'}
            className={`flex items-center gap-1.5 ${focusId ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={hideSrs} disabled={Boolean(focusId)}
              onChange={e => setHideSrs(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Hide SRS</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMinimap} onChange={e => setShowMinimap(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Minimap</span>
          </label>
          <label
            title={focusId ? 'Not shown while focused on a node' : 'Labelled cluster boundaries'}
            className={`flex items-center gap-1.5 ${focusId ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={showFrames} disabled={Boolean(focusId)}
              onChange={e => setShowFrames(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Cluster labels</span>
          </label>
          <label title="Preview a node or deck by resting the pointer on it"
            className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={peekEnabled}
              onChange={e => { setPeekEnabled(e.target.checked); if (!e.target.checked) cancelPeek() }}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Hover peek</span>
          </label>
        </div>

        {/* Study overlay */}
        <div className="px-3 py-2 border-b border-gray-100 space-y-1.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Study overlay</div>
          <div className="flex gap-1">
            {([
              ['off', 'Kind'],
              ['mastery', 'Mastery'],
              ['staleness', 'Stale'],
            ] as [OverlayMode, string][]).map(([mode, label]) => (
              <button key={mode} onClick={() => setOverlayMode(mode)}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  overlayMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
          {overlayMode !== 'off' && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full"
                style={{ background: 'linear-gradient(to right, #dc2626, #f59e0b, #16a34a)' }} />
              <div className="flex justify-between text-[9px] text-gray-400">
                <span>{overlayMode === 'mastery' ? 'always hard' : `${STALE_DAYS}d+ cold`}</span>
                <span>{overlayMode === 'mastery' ? 'easy' : 'just seen'}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-snug">
                {overlayMode === 'mastery'
                  ? 'Mean grade per card, from the review log. Grey = never graded.'
                  : 'Days since a card was last seen. Grey = never reviewed.'}
              </p>
            </div>
          )}
        </div>

        {/* As Of control */}
        <div className="p-3 border-b border-gray-100">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">As Of</label>
          <input type="datetime-local" value={asOfStr} onChange={e => setAsOfStr(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
          />
          {asOfStr && <button onClick={() => setAsOfStr('')} className="text-[10px] text-gray-400 hover:text-gray-600 mt-0.5">Clear</button>}
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-100">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search nodes…"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400"
          />
        </div>

        {/* New Node form */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex gap-1 mb-1">
            <input value={newNodeLabel} onChange={e => setNewNodeLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateNode()}
              placeholder="New node label…"
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
            />
            <button onClick={handleCreateNode} className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex-shrink-0">+</button>
          </div>
          <select value={newNodeKind} onChange={e => setNewNodeKind(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 text-gray-500">
            <option value="">No kind (freeform)</option>
            <option value="Type">Type</option>
            <option value="Property">Property</option>
            <option value="Place">Place</option>
          </select>
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-1">
            {visibleDbNodes.map(n => {
              const style = getKindStyle(n.kind)
              return (
                <div key={n.id}
                  className={`group w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${selectedId === n.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                  <span
                    title={n.kind ?? 'No kind'}
                    className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${style.badge} ${style.badgeText}`}>
                    {style.glyph}
                  </span>
                  <button onClick={() => setSelectedId(n.id)}
                    className={`flex-1 text-left truncate ${selectedId === n.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {n.label}
                  </button>
                  <button onClick={() => setFocusId(n.id)} title="Focus on this node"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-indigo-600 transition-opacity">
                    ⌖
                  </button>
                </div>
              )
            })}
            {visibleDbNodes.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No nodes</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="p-2 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
          <div className="flex gap-3">
            <span>{filteredDbNodes.length} nodes</span>
            <span>{filteredDbEdges.length} edges</span>
          </div>
          {collapseActive && collapsed.nodes.length < filteredDbNodes.length && (
            <div>
              drawing {collapsed.nodes.length} + {collapsed.chips.length} chips
            </div>
          )}
          {overLimit && (
            <div className="text-amber-500 font-medium">
              Canvas capped at {CANVAS_NODE_LIMIT}. Focus a node or filter to see the rest.
            </div>
          )}
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative">
        <PeekActiveContext.Provider value={peekEnabled}>
        <OverlayContext.Provider value={overlayColors}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={schedulePeekHide}
          onMoveStart={cancelPeek}
          onPaneClick={() => { setSelectedId(null); setSelectedClusterKey(null); cancelPeek() }}
          onDoubleClick={onPaneDoubleClick}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.05}
          maxZoom={3}
          deleteKeyCode="Delete"
          zoomOnDoubleClick={false}
          // Only render nodes/edges actually visible in the viewport — big perf win
          onlyRenderVisibleElements
        >
          <Background color="#e5e7eb" gap={20} />
          <Controls />
          {showMinimap && (
            <MiniMap
              nodeColor={(n: RFNode) => getKindStyle((n.data as { kind?: string }).kind).dot}
              pannable
              zoomable
            />
          )}
        </ReactFlow>
        </OverlayContext.Provider>
        </PeekActiveContext.Provider>
      </div>

      {/* Hover peek — outside the canvas so it is never clipped by it. */}
      {peek && (
        <NodePeek
          target={peek}
          onMouseEnter={holdPeek}
          onMouseLeave={cancelPeek}
          nodes={filteredDbNodes}
          edges={filteredDbEdges}
          clusters={clusterStats}
          overlay={overlayValues}
          onOpen={() => {
            if (peek.kind === 'cluster') {
              setSelectedId(null)
              setSelectedClusterKey(peek.clusterKey)
            } else {
              setSelectedClusterKey(null)
              setSelectedId(peek.id)
            }
            cancelPeek()
          }}
        />
      )}

      {/* Right Detail Drawer */}
      {selectedCluster && !selectedNode && (
        <ClusterDetailDrawer
          cluster={selectedCluster}
          allNodes={dbNodes}
          allEdges={dbEdges}
          expanded={expandedClusters.has(selectedCluster.clusterKey)}
          onClose={() => setSelectedClusterKey(null)}
          onToggleExpand={toggleCluster}
          onSelectNode={(id) => { setSelectedClusterKey(null); setSelectedId(id) }}
          onFocus={(id) => { setSelectedClusterKey(null); setFocusId(id) }}
          onUpdateNode={updateNode}
        />
      )}
      {selectedNode && (
        <NodeDetailDrawer
          node={selectedNode}
          allNodes={dbNodes}
          allEdges={dbEdges}
          onClose={() => setSelectedId(null)}
          onUpdate={updateNode}
          onDelete={async (id) => { await deleteNode(id); setSelectedId(null) }}
          onCreateEdge={createEdge}
          onDeleteEdge={deleteEdge}
          onFocus={(id) => setFocusId(id)}
        />
      )}
    </div>
  )
}

export default function QuiltGraph() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  )
}
