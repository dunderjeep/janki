'use client'

import { createContext, memo, useContext, type ReactNode } from 'react'
import { Handle, Position, useStore } from 'reactflow'
import { getKindStyle, lodFor, dotScaleFor, DOT_BASE_PX, type LodLevel } from './graphUtils'

type QuiltNodeData = {
  label: string
  kind?: string
  nodeId: string
  /** Replaces the kind badge — kind is already encoded by border and fill colour. */
  context?: string
}

/**
 * Selecting the LOD *level* rather than the raw zoom matters: zustand only
 * re-renders subscribers when the selected value changes, so nodes re-render
 * when crossing a threshold instead of on every zoom tick.
 */
const selectLod = (s: { transform: [number, number, number] }): LodLevel => lodFor(s.transform[2])

/**
 * Whether the hover peek is doing the explaining.
 *
 * The nodes carry a native `title` so hovering says something when the peek is
 * switched off — but with it on, Firefox draws its own black tooltip over the
 * peek card. Context rather than node data: flipping the toggle then re-renders
 * the nodes without rebuilding every RFNode object.
 */
export const PeekActiveContext = createContext(false)

/**
 * Overlay colour per node, or null when the overlay is off.
 *
 * A map in context rather than a field on each node's data: the overlay is a
 * lens over the same graph, and threading it through node data would rebuild
 * every RFNode object each time it is switched or refetched.
 */
export const OverlayContext = createContext<Map<string, string> | null>(null)

/** Overlay colour wins over kind colour — that is the point of turning it on. */
function useNodeColor(nodeId: string, fallback: string): string {
  return useContext(OverlayContext)?.get(nodeId) ?? fallback
}

/** Undefined drops the attribute entirely, which is what suppresses the tooltip. */
function useNativeTitle(text: string): string | undefined {
  return useContext(PeekActiveContext) ? undefined : text
}

/** Same contract as selectLod: quantised, so dots re-render at steps not ticks. */
const selectDotScale = (s: { transform: [number, number, number] }) => dotScaleFor(s.transform[2])

/**
 * The zoomed-out mark for a node.
 *
 * Sized in canvas units but counter-scaled by zoom, so a dot holds a constant
 * few pixels on screen instead of vanishing at overview zoom. The halo is scaled
 * with it — a fixed 1 px ring is invisible once the canvas is at 0.06.
 *
 * The outer box keeps DOT_BASE_PX so the mark stays centred on the node's real
 * position no matter how far the inner circle is grown.
 */
function QuiltDot({
  data, style, selected, handles,
}: {
  data: QuiltNodeData
  style: ReturnType<typeof getKindStyle>
  selected: boolean
  handles: ReactNode
}) {
  const scale = useStore(selectDotScale)
  const title = useNativeTitle(data.label)
  const color = useNodeColor(data.nodeId, style.dot)
  const size = DOT_BASE_PX * scale

  return (
    <div
      title={title}
      className="flex items-center justify-center"
      style={{ width: DOT_BASE_PX, height: DOT_BASE_PX }}
    >
      <div
        className="rounded-full flex-shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          boxShadow: selected
            ? `0 0 0 ${scale * 2}px #6366f1`
            : `0 0 0 ${scale}px rgba(255,255,255,0.85)`,
        }}
      />
      {handles}
    </div>
  )
}

export const QuiltNode = memo(function QuiltNode({ data, selected }: { data: QuiltNodeData; selected: boolean }) {
  const style = getKindStyle(data.kind)
  const lod = useStore(selectLod)
  const title = useNativeTitle(data.label)
  const overlay = useContext(OverlayContext)?.get(data.nodeId) ?? null

  const handles = (
    <>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2 !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !opacity-0" />
    </>
  )

  if (lod === 'dot') return <QuiltDot data={data} style={style} selected={selected} handles={handles} />

  if (lod === 'glyph') {
    return (
      <div
        title={title}
        className={`
          w-9 h-9 rounded-lg border-2 flex items-center justify-center
          relative text-[13px] font-bold shadow-sm cursor-pointer
          ${style.bg} ${style.border} ${style.badgeText}
          ${selected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}
        `}
      >
        {style.glyph}
        {overlay && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white"
            style={{ backgroundColor: overlay }} />
        )}
        {handles}
      </div>
    )
  }

  return (
    <div title={title}
      style={overlay ? { borderColor: overlay } : undefined}
      className={`
      min-w-[90px] max-w-[160px] rounded-lg border-2 px-2.5 py-2 text-center shadow-sm
      transition-shadow cursor-pointer
      ${style.bg} ${style.border}
      ${selected ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md' : 'hover:shadow-md'}
    `}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />
      <div className="text-xs font-medium text-gray-900 leading-tight truncate">{data.label}</div>
      {data.context && (
        <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${style.badge} ${style.badgeText} block mt-1 truncate`}>
          {data.context}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />
    </div>
  )
})

type ClusterChipData = {
  clusterKey: string
  hiddenCount: number
  expanded: boolean
}

/**
 * The "+N more" / "collapse" affordance for a deck cluster. Purely presentational —
 * clicks are handled by the canvas's onNodeClick, which knows the node type.
 */
export const ClusterChipNode = memo(function ClusterChipNode({ data }: { data: ClusterChipData }) {
  const lod = useStore(selectLod)

  if (data.expanded) {
    return (
      <div
        title="Collapse this deck"
        className="px-2 py-1 rounded-full border border-gray-300 bg-white/90 text-[10px]
                   font-medium text-gray-500 shadow-sm cursor-pointer hover:border-gray-400 hover:text-gray-700">
        {lod === 'dot' ? '−' : '− collapse'}
      </div>
    )
  }

  return (
    <div
      title={`Show ${data.hiddenCount} more`}
      className="px-2.5 py-1 rounded-full border-2 border-dashed border-indigo-300 bg-indigo-50
                 text-[11px] font-semibold text-indigo-600 shadow-sm cursor-pointer
                 hover:bg-indigo-100 hover:border-indigo-400">
      +{data.hiddenCount}{lod === 'full' ? ' more' : ''}
    </div>
  )
})

type ClusterFrameData = {
  clusterKey: string
  label: string
  cardCount: number
  topicCount: number
  missingCards: number
  topTopics: string[]
  width: number
  height: number
  /** 'group' frames stand for many small clusters and skip the per-cluster counts. */
  variant?: 'cluster' | 'group'
  /** Study-overlay colour for the cluster as a whole, when the overlay is on. */
  overlay?: string | null
}

const selectZoom = (s: { transform: [number, number, number] }) => s.transform[2]

// Caption tiers, by how wide the frame is *on screen*. The name is the last
// thing to go, not the first: the counts used to be flex-shrink-0 next to a
// truncating name, so a middling zoom printed "#24 +6 not imp" with the deck's
// name squeezed to nothing — exactly the information the frame exists to carry.
/** Below this a wrapped name is one character per line, which is worse than none. */
const MIN_NAME_PX = 46
/** Below this, name only — no counts. */
const MIN_COUNTS_PX = 112
/** Below this, no topic subtitle. */
const MIN_SUBTITLE_PX = 200

/**
 * Labelled boundary behind a cluster — the layer that says what you're looking at.
 *
 * Only the caption takes pointer events (the canvas sets pointerEvents:'none' on
 * the frame's wrapper, which is otherwise a click surface the size of the whole
 * cluster). Clicking or hovering the caption reaches the canvas's node handlers,
 * which dispatch on the 'clusterFrame' type.
 *
 * The caption counter-scales with zoom so it stays legible when the nodes inside
 * have dropped to dots, and is clamped to the frame's own on-screen width — that
 * clamp is what stops neighbouring captions printing over each other, since the
 * frames themselves never overlap.
 *
 * Name, counts and topics are stacked rather than set on one line. Inline, the
 * name shared a row with counts that would not shrink, so it was the part that
 * got clipped ("CEFR A1…") while "C50 #1" survived at full width. Stacked, the
 * name gets the whole clamp and wraps to as many lines as it needs.
 */
export const ClusterFrameNode = memo(function ClusterFrameNode({ data }: { data: ClusterFrameData }) {
  const zoom = useStore(selectZoom)
  const scale = Math.min(1 / Math.max(zoom, 0.02), 26)

  // Width available to the caption, in post-scale (screen) pixels.
  const onScreenWidth = data.width * zoom
  const showCaption = onScreenWidth >= MIN_NAME_PX
  const showCounts = onScreenWidth >= MIN_COUNTS_PX
  const showSubtitle = onScreenWidth >= MIN_SUBTITLE_PX && data.topTopics.length > 0
  const isGroup = data.variant === 'group'

  const captionTitle = showCounts
    ? `Open ${data.label}`
    : `${data.label} — ${data.cardCount} cards, ${data.topicCount} topics`

  // The usable chord near the top of a circle. Well under 1.0, which is what
  // keeps a caption inside its own circle and so clear of every neighbour.
  const chord = 0.8

  return (
    <div
      className={`rounded-full border-2 border-dashed pointer-events-none ${
        data.overlay ? '' : isGroup ? 'border-gray-300 bg-gray-100/40' : 'border-gray-200 bg-gray-50/40'
      }`}
      style={{
        width: data.width,
        height: data.height,
        // A wash rather than a fill: the frame has to stay behind its contents.
        ...(data.overlay ? { borderColor: data.overlay, backgroundColor: `${data.overlay}14` } : {}),
      }}
    >
      {showCaption && (
        <div
          title={captionTitle}
          className="origin-top mx-auto text-center rounded bg-white/70
                     pointer-events-auto cursor-pointer hover:bg-white"
          style={{
            transform: `scale(${scale})`,
            padding: '4px 6px',
            // Clamp to the circle so a caption can never spill onto its neighbour.
            width: Math.max(onScreenWidth * chord - 12, 34),
          }}
        >
          {/* No line clamp: the name is the whole point of the frame, so it wraps
              to whatever it needs. `anywhere` keeps a single long token from
              pushing the box wider than the clamp. */}
          <div
            className="text-[11px] font-semibold text-gray-800 leading-tight"
            style={{ overflowWrap: 'anywhere' }}
          >
            {data.label}
          </div>

          {showCounts && !isGroup && (
            <div className="flex items-baseline justify-center gap-1.5 flex-wrap leading-tight">
              <span className="text-[10px] text-amber-600" title={`${data.cardCount} cards`}>
                C{data.cardCount}
              </span>
              <span className="text-[10px] text-sky-600" title={`${data.topicCount} topics`}>
                #{data.topicCount}
              </span>
              {data.missingCards > 0 && (
                <span className="text-[10px] text-gray-400"
                  title={`${data.missingCards} cards exist in SRS but are not in the graph`}>
                  +{data.missingCards} not imported
                </span>
              )}
            </div>
          )}

          {showCounts && isGroup && data.missingCards > 0 && (
            <div className="text-[10px] text-gray-400 leading-tight"
              title={`${data.missingCards} cards exist in SRS but are not in the graph`}>
              +{data.missingCards} not imported
            </div>
          )}

          {showSubtitle && (
            <div className="text-[9px] text-gray-400 truncate leading-tight">
              {data.topTopics.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export const nodeTypes = {
  quiltNode: QuiltNode,
  clusterChip: ClusterChipNode,
  clusterFrame: ClusterFrameNode,
}
