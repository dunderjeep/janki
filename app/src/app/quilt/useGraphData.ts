'use client'

import { useState, useCallback, useEffect } from 'react'
import type {
  GraphNode, GraphEdge, GraphNodeSummary, GraphEdgeSummary, ClusterStats, CardMastery,
} from '@/lib/graphStore'

/** Full rows come back from the mutation endpoints; the canvas only keeps the projection. */
function toNodeSummary(node: GraphNode): GraphNodeSummary {
  const props = (node.props ?? {}) as Record<string, unknown>
  return {
    id: node.id,
    label: node.label,
    kind: (props.kind as string | undefined) ?? null,
    ui: node.ui,
    validFrom: node.validFrom,
    validTo: node.validTo,
  }
}

function toEdgeSummary(edge: GraphEdge): GraphEdgeSummary {
  return {
    id: edge.id,
    type: edge.type,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    fromPortId: edge.fromPortId,
    toPortId: edge.toPortId,
    validFrom: edge.validFrom,
    validTo: edge.validTo,
  }
}

export type UseGraphDataOptions = {
  excludeKinds?: string[]
  /** When set, load only this node's neighbourhood instead of the whole graph. */
  focusId?: string | null
  /** Hops to expand from the focus node. Ignored when focusId is null. */
  depth?: number
}

export function useGraphData(opts: UseGraphDataOptions = {}) {
  const excludeKindsKey = (opts.excludeKinds ?? []).join(',')
  const { focusId = null, depth = 1 } = opts

  const [nodes, setNodes] = useState<GraphNodeSummary[]>([])
  const [edges, setEdges] = useState<GraphEdgeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (focusId) {
        const res = await fetch(`/api/graph/nodes/${focusId}/neighborhood?depth=${depth}`)
        if (!res.ok) throw new Error('Failed to load neighbourhood')
        const data = await res.json()
        setNodes(data.nodes ?? [])
        setEdges(data.edges ?? [])
        setTruncated(Boolean(data.truncated))
      } else {
        const qs = excludeKindsKey ? `?excludeKinds=${excludeKindsKey}` : ''
        const [nodesRes, edgesRes] = await Promise.all([
          fetch(`/api/graph/nodes${qs}`),
          fetch(`/api/graph/edges${qs}`),
        ])
        if (!nodesRes.ok || !edgesRes.ok) throw new Error('Failed to load graph')
        const [{ nodes: n }, { edges: e }] = await Promise.all([nodesRes.json(), edgesRes.json()])
        setNodes(n)
        setEdges(e)
        setTruncated(false)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [excludeKindsKey, focusId, depth])

  useEffect(() => { reload() }, [reload])

  // Optimistic local updates
  const patchNodeLocal = useCallback((id: string, patch: Partial<GraphNodeSummary>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
  }, [])

  const addNodeLocal = useCallback((node: GraphNodeSummary) => {
    setNodes(prev => [...prev, node])
  }, [])

  const removeNodeLocal = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.fromNodeId !== id && e.toNodeId !== id))
  }, [])

  const addEdgeLocal = useCallback((edge: GraphEdgeSummary) => {
    setEdges(prev => [...prev, edge])
  }, [])

  const removeEdgeLocal = useCallback((id: string) => {
    setEdges(prev => prev.filter(e => e.id !== id))
  }, [])

  // API mutations
  const createNode = useCallback(async (body: {
    label: string; props?: Record<string, unknown>; ui?: { x: number; y: number }
  }): Promise<GraphNode | null> => {
    const res = await fetch('/api/graph/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const { node } = await res.json()
    addNodeLocal(toNodeSummary(node))
    return node
  }, [addNodeLocal])

  const updateNode = useCallback(async (id: string, patch: Partial<GraphNode>): Promise<void> => {
    // Only the projected fields need to change on the canvas; the drawer refetches
    // full detail after saving.
    const localPatch: Partial<GraphNodeSummary> = {}
    if (patch.label !== undefined) localPatch.label = patch.label
    if (patch.ui !== undefined) localPatch.ui = patch.ui
    if (patch.props !== undefined) {
      localPatch.kind = ((patch.props as Record<string, unknown>).kind as string | undefined) ?? null
    }
    if (Object.keys(localPatch).length > 0) patchNodeLocal(id, localPatch)

    await fetch(`/api/graph/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }, [patchNodeLocal])

  const deleteNode = useCallback(async (id: string): Promise<void> => {
    removeNodeLocal(id) // optimistic
    await fetch(`/api/graph/nodes/${id}`, { method: 'DELETE' })
  }, [removeNodeLocal])

  const createEdge = useCallback(async (body: {
    type: string; fromNodeId: string; toNodeId: string; props?: Record<string, unknown>
  }): Promise<GraphEdge | null> => {
    const res = await fetch('/api/graph/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const { edge } = await res.json()
    addEdgeLocal(toEdgeSummary(edge))
    return edge
  }, [addEdgeLocal])

  const deleteEdge = useCallback(async (id: string): Promise<void> => {
    removeEdgeLocal(id) // optimistic
    await fetch(`/api/graph/edges/${id}`, { method: 'DELETE' })
  }, [removeEdgeLocal])

  return {
    nodes, edges, loading, error, truncated, reload,
    createNode, updateNode, deleteNode,
    createEdge, deleteEdge,
    patchNodeLocal, addEdgeLocal, removeEdgeLocal,
  }
}

/**
 * Per-cluster stats for the canvas frames. Separate from the node payload —
 * 62 rows / ~15 kB, so it costs nothing and never grows with the graph.
 */
export function useClusterStats(enabled: boolean) {
  const [clusters, setClusters] = useState<ClusterStats[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch('/api/graph/clusters')
      .then(r => (r.ok ? r.json() : { clusters: [] }))
      .then(d => { if (!cancelled) setClusters(d.clusters ?? []) })
      .catch(() => { if (!cancelled) setClusters([]) })
    return () => { cancelled = true }
  }, [enabled])

  return clusters
}

/**
 * Per-card study history for the overlay. ~630 rows, fetched once when the
 * overlay is first switched on and then kept — it does not change while you pan.
 */
export function useMastery(enabled: boolean) {
  const [mastery, setMastery] = useState<CardMastery[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!enabled || loaded) return
    let cancelled = false
    fetch('/api/graph/mastery')
      .then(r => (r.ok ? r.json() : { mastery: [] }))
      .then(d => { if (!cancelled) { setMastery(d.mastery ?? []); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [enabled, loaded])

  return mastery
}

/** Full node detail, loaded only for the currently selected node. */
export function useNodeDetail(nodeId: string | null) {
  const [node, setNode] = useState<GraphNode | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!nodeId) {
      setNode(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/graph/nodes/${nodeId}`)
      if (!res.ok) {
        setNode(null)
        return
      }
      const { node: full } = await res.json()
      setNode(full)
    } finally {
      setLoading(false)
    }
  }, [nodeId])

  useEffect(() => { load() }, [load])

  return { node, loading, reload: load }
}
