'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getKindStyle, type OverlayValue } from './graphUtils'
import type { GraphNode, GraphNodeSummary, GraphEdgeSummary, ClusterStats } from '@/lib/graphStore'

/** What the pointer is over. Frames and nodes peek differently. */
export type PeekTarget =
  | { kind: 'node'; id: string; x: number; y: number }
  | { kind: 'cluster'; clusterKey: string; x: number; y: number }

const PEEK_W = 300
/** Clearance from the cursor so the popup never sits under the pointer itself. */
const CURSOR_GAP = 16

/** Long card fronts/backs are essays; the peek is a glance, not the card. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Keep the popup on screen. Prefers below-right of the cursor and flips on
 * whichever axis runs out of room, so a node at the bottom-right of the canvas
 * peeks up-left instead of half off the viewport.
 */
function place(x: number, y: number, height: number) {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const left = x + CURSOR_GAP + PEEK_W > vw ? Math.max(8, x - CURSOR_GAP - PEEK_W) : x + CURSOR_GAP
  const top = y + CURSOR_GAP + height > vh ? Math.max(8, vh - height - 8) : y + CURSOR_GAP
  return { left, top }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-snug">
      <span className="text-gray-400 flex-shrink-0 w-14">{label}</span>
      <span className="text-gray-700 min-w-0">{value}</span>
    </div>
  )
}

/**
 * Hover preview — the canvas equivalent of peeking at a definition in another
 * window. Read-only and never focus-stealing: it exists so you can sweep the
 * pointer across a cluster and learn what is in it without a click per node.
 */
export default function NodePeek({
  target, nodes, edges, clusters, overlay, onOpen, onMouseEnter, onMouseLeave,
}: {
  target: PeekTarget
  nodes: GraphNodeSummary[]
  edges: GraphEdgeSummary[]
  clusters: ClusterStats[]
  /** Study history per node, when the overlay is on. */
  overlay: Map<string, OverlayValue> | null
  /** Click-through to the full editor for whatever is being peeked. */
  onOpen: () => void
  /** Keeps the popup alive while the pointer is on it — see PEEK_HIDE_MS. */
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(180)

  // Full props (card front/back, descriptions) only exist on the full row; the
  // canvas carries projections. One small fetch per hovered node, cached below.
  const [detail, setDetail] = useState<GraphNode | null>(null)

  const nodeId = target.kind === 'node' ? target.id : null

  useEffect(() => {
    if (!nodeId) return
    let cancelled = false
    setDetail(null)
    fetch(`/api/graph/nodes/${nodeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.node) setDetail(d.node) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [nodeId])

  useEffect(() => {
    if (boxRef.current) setHeight(boxRef.current.offsetHeight)
  }, [detail, target])

  const summary = useMemo(
    () => (nodeId ? nodes.find(n => n.id === nodeId) ?? null : null),
    [nodeId, nodes]
  )

  // Neighbours come from the already-loaded edge set — no second round trip, and
  // it stays correct while the canvas is filtered.
  const links = useMemo(() => {
    if (!nodeId) return null
    const labels = new Map(nodes.map(n => [n.id, n.label]))
    const out: { type: string; label: string; dir: '→' | '←' }[] = []
    let total = 0
    for (const e of edges) {
      if (e.fromNodeId === nodeId) {
        total++
        if (out.length < 6) out.push({ type: e.type, label: labels.get(e.toNodeId) ?? '?', dir: '→' })
      } else if (e.toNodeId === nodeId) {
        total++
        if (out.length < 6) out.push({ type: e.type, label: labels.get(e.fromNodeId) ?? '?', dir: '←' })
      }
    }
    return { shown: out, total }
  }, [nodeId, nodes, edges])

  const cluster = useMemo(
    () => (target.kind === 'cluster' ? clusters.find(c => c.clusterKey === target.clusterKey) ?? null : null),
    [target, clusters]
  )

  const pos = place(target.x, target.y, height)

  const shell = (children: ReactNode, accent: string) => (
    <div
      ref={boxRef}
      onClick={onOpen}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 rounded-lg border border-gray-200 bg-white shadow-xl
                 overflow-hidden cursor-pointer"
      style={{ left: pos.left, top: pos.top, width: PEEK_W }}
    >
      <div className="h-0.5" style={{ backgroundColor: accent }} />
      <div className="p-2.5 space-y-1.5">{children}</div>
      <div className="px-2.5 py-1 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
        Click to open · double-click to focus
      </div>
    </div>
  )

  if (target.kind === 'cluster') {
    if (!cluster) return null
    const missing = Math.max(0, (cluster.srsCardCount ?? 0) - cluster.cardCount)
    return shell(
      <>
        <div className="text-xs font-semibold text-gray-900 leading-snug">{cluster.label}</div>
        <Row label="In graph" value={`${cluster.cardCount} cards · ${cluster.topicCount} topics`} />
        {cluster.srsCardCount !== null && (
          <Row label="In SRS" value={`${cluster.srsCardCount} cards${missing > 0 ? ` (${missing} not imported)` : ''}`} />
        )}
        {cluster.topTopics.length > 0 && (
          <Row label="Topics" value={cluster.topTopics.join(' · ')} />
        )}
      </>,
      '#6366f1'
    )
  }

  if (!summary) return null

  const style = getKindStyle(summary.kind)
  const study = overlay?.get(summary.id) ?? null
  const props = (detail?.props ?? {}) as Record<string, unknown>
  const front = typeof props.front === 'string' ? props.front : null
  const back = typeof props.back === 'string' ? props.back : null
  const description = typeof props.description === 'string' ? props.description : null
  const tags = Array.isArray(props.tags) ? (props.tags as unknown[]).map(String) : []

  return shell(
    <>
      <div className="flex items-start gap-1.5">
        <span className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center
                          text-[9px] font-bold ${style.badge} ${style.badgeText}`}>
          {style.glyph}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-900 leading-snug">{clip(summary.label, 120)}</div>
          <div className="text-[10px] text-gray-400">{summary.kind ?? 'no kind'}</div>
        </div>
      </div>

      {study && (
        <Row
          label="Study"
          value={
            study.score === null
              ? study.reps > 0 ? `${study.reps} reviews` : 'never reviewed'
              : `${Math.round(study.score * 100)}% ease over ${study.reps} review` +
                `${study.reps === 1 ? '' : 's'}` +
                (study.days === null ? '' : `, last seen ${study.days}d ago`)
          }
        />
      )}
      {front && <Row label="Front" value={clip(front, 160)} />}
      {back && <Row label="Back" value={clip(back, 220)} />}
      {description && <Row label="About" value={clip(description, 180)} />}
      {typeof props.key === 'string' && <Row label="Key" value={props.key} />}
      {tags.length > 0 && <Row label="Tags" value={tags.join(', ')} />}

      {links && links.total > 0 && (
        <div className="pt-1 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 mb-0.5">
            {links.total} connection{links.total === 1 ? '' : 's'}
          </div>
          {links.shown.map((l, i) => (
            <div key={i} className="flex gap-1 text-[10px] leading-snug">
              <span className="text-gray-400 flex-shrink-0">{l.dir}</span>
              <span className="text-indigo-500 flex-shrink-0">{l.type}</span>
              <span className="text-gray-600 truncate">{clip(l.label, 40)}</span>
            </div>
          ))}
          {links.total > links.shown.length && (
            <div className="text-[10px] text-gray-400">+{links.total - links.shown.length} more</div>
          )}
        </div>
      )}

      {!detail && <div className="text-[10px] text-gray-300">loading…</div>}
    </>,
    style.dot
  )
}
