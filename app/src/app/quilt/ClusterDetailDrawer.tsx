'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getKindStyle, readUi, LOOSE_CLUSTER, SCHEMA_CLUSTER } from './graphUtils'
import type { GraphNode, GraphNodeSummary, GraphEdgeSummary, ClusterStats } from '@/lib/graphStore'

interface Props {
  cluster: ClusterStats
  /** Unfiltered node/edge sets — the drawer reports what the cluster holds, not
   *  what survived the canvas filters. */
  allNodes: GraphNodeSummary[]
  allEdges: GraphEdgeSummary[]
  expanded: boolean
  onClose: () => void
  onToggleExpand: (clusterKey: string) => void
  onSelectNode: (id: string) => void
  onFocus: (id: string) => void
  onUpdateNode: (id: string, patch: Partial<GraphNode>) => Promise<void>
}

/** Members grouped by kind, each with its in-cluster degree for ranking. */
function useMembers(clusterKey: string, allNodes: GraphNodeSummary[], allEdges: GraphEdgeSummary[]) {
  return useMemo(() => {
    const members = allNodes.filter(n => readUi(n.ui).cluster === clusterKey)
    const ids = new Set(members.map(n => n.id))

    const degree = new Map<string, number>()
    for (const e of allEdges) {
      if (ids.has(e.fromNodeId)) degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1)
      if (ids.has(e.toNodeId)) degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1)
    }

    const byKind = new Map<string, GraphNodeSummary[]>()
    for (const n of members) {
      const kind = n.kind ?? 'Other'
      const bucket = byKind.get(kind)
      if (bucket) bucket.push(n)
      else byKind.set(kind, [n])
    }
    for (const bucket of byKind.values()) {
      bucket.sort((a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label))
    }

    // Topics before Cards: a topic list is the table of contents, the card list
    // is the contents themselves.
    const order = ['Deck', 'Topic', 'Card']
    const kinds = [...byKind.keys()].sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })

    return { total: members.length, byKind, kinds, degree }
  }, [clusterKey, allNodes, allEdges])
}

const PAGE = 25

/**
 * What a cluster frame opens.
 *
 * A frame used to be inert scenery: it named a region but you could not get at
 * what it named. This is the frame's own detail panel — the deck's contents,
 * grouped and ranked, with every row a way into the node drawer.
 */
export default function ClusterDetailDrawer({
  cluster, allNodes, allEdges, expanded, onClose, onToggleExpand,
  onSelectNode, onFocus, onUpdateNode,
}: Props) {
  const { total, byKind, kinds, degree } = useMembers(cluster.clusterKey, allNodes, allEdges)

  const [name, setName] = useState(cluster.label)
  const [saving, setSaving] = useState<null | 'saving' | 'saved' | 'error'>(null)
  const [shown, setShown] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setName(cluster.label)
    setSaving(null)
    setShown({})
    setFilter('')
  }, [cluster.clusterKey, cluster.label])

  // __loose and __schema are bins the layout invented, not decks — nothing to rename.
  const isRealDeck = cluster.clusterKey !== LOOSE_CLUSTER && cluster.clusterKey !== SCHEMA_CLUSTER
  const deckNodeId = cluster.deckNodeId ?? (isRealDeck ? cluster.clusterKey : null)
  const missing = Math.max(0, (cluster.srsCardCount ?? 0) - cluster.cardCount)

  /**
   * The deck exists twice — as a graph node and as an SRS deck row — and the
   * canvas now reads its name from the SRS row. Renaming has to write both or
   * the label reverts on the next load.
   */
  const saveName = async () => {
    const next = name.trim()
    if (!next || next === cluster.label || !isRealDeck) return
    setSaving('saving')
    try {
      const res = await fetch(`/api/srs/decks/${cluster.clusterKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      })
      if (deckNodeId) await onUpdateNode(deckNodeId, { label: next } as Partial<GraphNode>)
      setSaving(res.ok || deckNodeId ? 'saved' : 'error')
    } catch {
      setSaving('error')
    }
  }

  const q = filter.trim().toLowerCase()

  return (
    <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-3 border-b border-gray-200">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
            {isRealDeck ? 'Deck' : 'Bin'}
          </div>
          {isRealDeck ? (
            <input
              value={name}
              onChange={e => { setName(e.target.value); setSaving(null) }}
              onBlur={saveName}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-full text-sm font-semibold text-gray-900 border border-transparent
                         hover:border-gray-200 focus:border-indigo-400 rounded px-1 -mx-1
                         focus:outline-none"
            />
          ) : (
            <div className="text-sm font-semibold text-gray-900">{cluster.label}</div>
          )}
          {saving && (
            <div className={`text-[10px] mt-0.5 ${saving === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
              {saving === 'saving' ? 'saving…' : saving === 'saved' ? 'saved' : 'could not save'}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {/* Counts */}
      <div className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-500 space-y-0.5">
        <div>{total} nodes — {cluster.cardCount} cards, {cluster.topicCount} topics</div>
        {cluster.srsCardCount !== null && cluster.srsCardCount > 0 && (
          <div>
            {cluster.srsCardCount} cards in SRS
            {missing > 0 && <span className="text-amber-600"> · {missing} not in the graph</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
        {isRealDeck && (
          <Link href={`/srs/${cluster.clusterKey}`}
            className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">
            Study deck
          </Link>
        )}
        {deckNodeId && allNodes.some(n => n.id === deckNodeId) && (
          <button onClick={() => onFocus(deckNodeId)}
            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:border-gray-400">
            Focus
          </button>
        )}
        <button onClick={() => onToggleExpand(cluster.clusterKey)}
          className="text-[11px] px-2 py-1 rounded border border-gray-200 text-gray-600 hover:border-gray-400">
          {expanded ? 'Collapse on canvas' : 'Expand on canvas'}
        </button>
      </div>

      <div className="px-3 py-2 border-b border-gray-100">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter contents…"
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5
                     focus:outline-none focus:border-indigo-400"
        />
      </div>

      {/* Contents */}
      <div className="flex-1 overflow-y-auto">
        {kinds.map(kind => {
          const all = byKind.get(kind) ?? []
          const matching = q ? all.filter(n => n.label.toLowerCase().includes(q)) : all
          if (matching.length === 0) return null
          const limit = shown[kind] ?? PAGE
          const style = getKindStyle(kind === 'Other' ? null : kind)

          return (
            <div key={kind}>
              <div className="sticky top-0 bg-gray-50 px-3 py-1 text-[10px] font-semibold
                              text-gray-500 uppercase tracking-wide border-y border-gray-100">
                {kind} · {matching.length}
              </div>
              <div className="p-1">
                {matching.slice(0, limit).map(n => (
                  <div key={n.id}
                    className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50">
                    <span className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center
                                      text-[9px] font-bold ${style.badge} ${style.badgeText}`}>
                      {style.glyph}
                    </span>
                    <button onClick={() => onSelectNode(n.id)}
                      title={n.label}
                      className="flex-1 min-w-0 text-left text-xs text-gray-700 truncate hover:text-indigo-700">
                      {n.label}
                    </button>
                    <span className="text-[9px] text-gray-300 flex-shrink-0">{degree.get(n.id) ?? 0}</span>
                    <button onClick={() => onFocus(n.id)} title="Focus on this node"
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[10px]
                                 text-gray-400 hover:text-indigo-600 transition-opacity">
                      ⌖
                    </button>
                  </div>
                ))}
                {matching.length > limit && (
                  <button onClick={() => setShown(s => ({ ...s, [kind]: limit + PAGE }))}
                    className="w-full text-[10px] text-gray-400 hover:text-gray-700 py-1">
                    Show {Math.min(PAGE, matching.length - limit)} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {total === 0 && <p className="text-xs text-gray-400 text-center py-6">Nothing in this cluster</p>}
      </div>
    </aside>
  )
}
