'use client'

import { createContext, memo, useContext } from 'react'
import { Handle, Position, useStore } from 'reactflow'
import { ringStyle } from './orgGraph'

type OrgNodeData = {
  nodeId: string
  title: string
  ring: number
  age: number | null
  tags: string[]
  todo: string | null
  pinned: boolean
  degree: number
}

/**
 * The selected note and everything it links to, or null when nothing is
 * selected. Context rather than node data so selecting does not rebuild 1200
 * RFNode objects.
 */
export const HighlightContext = createContext<Set<string> | null>(null)

const selectZoom = (s: { transform: [number, number, number] }) => s.transform[2]
/** Quantised: nodes re-render at a few thresholds instead of every wheel tick. */
const selectTier = (s: { transform: [number, number, number] }) => {
  const z = s.transform[2]
  return z < 0.22 ? 'dot' : z < 0.55 ? 'small' : 'full'
}

/**
 * Counter-scale for labels, quantised to half steps.
 *
 * Labels used to vanish below 0.55 zoom, which is most of the time — the whole
 * point of the rings is the pulled-back view, and a ring of anonymous dots
 * cannot be read. Growing the text in canvas units holds it at a constant size
 * on screen instead, the same trick the cluster captions use on /quilt.
 */
const selectLabelScale = (s: { transform: [number, number, number] }) => {
  const z = Math.max(s.transform[2], 0.02)
  return z >= 1 ? 1 : Math.min(Math.ceil((1 / z) * 2) / 2, 8)
}

/** Below this the labels collide into noise however large they are drawn. */
const MIN_LABEL_ZOOM = 0.12

/**
 * A note on the canvas.
 *
 * Size carries how connected a note is, colour carries its horizon. Both are
 * readable at a glance and neither needs the label, which matters because at
 * 1200 nodes the labels are the only thing that costs anything to draw.
 */
export const OrgNode = memo(function OrgNode({ data, selected }: { data: OrgNodeData; selected: boolean }) {
  const tier = useStore(selectTier)
  const zoom = useStore(selectZoom)
  const labelScale = useStore(selectLabelScale)
  const style = ringStyle(data.ring)

  // A hub should look like a hub from across the canvas.
  const size = Math.min(10 + Math.sqrt(data.degree) * 3.2, 30)

  // Ring 0 spans three days of dailies; carried-over items read as older so the
  // centre still distinguishes today from the tail of the week.
  const ageFade = data.age === null ? 1 : Math.max(0.45, 1 - data.age * 0.25)

  // A selection spotlights its own neighbourhood: everything else recedes far
  // enough to read the shape of what connects, without disappearing.
  const highlight = useContext(HighlightContext)
  const lit = !highlight || highlight.has(data.nodeId)
  const opacity = ageFade * (lit ? 1 : 0.12)

  const handles = (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0 !w-1 !h-1" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !w-1 !h-1" />
      {/* The knob you drag a new link from. Beside the dot rather than over
          it: a handle is a no-drag zone, and covering the dot would stop the
          note itself being moved. Shown on hover only, and not at dot zoom
          where nothing is close enough to aim at. The far end needs no handle
          of its own — the canvas snaps a drop to the nearest note. */}
      {tier !== 'dot' && (
        <Handle
          id="link"
          type="source"
          position={Position.Right}
          title="Drag to another note to link them"
          className="!w-3 !h-3 !min-w-0 !border !border-indigo-500 !bg-white
                     opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ top: size / 2, right: -10 }}
        />
      )}
    </>
  )

  const dotScale = tier === 'dot' ? Math.max(1, 7 / (size * Math.max(zoom, 0.01))) : 1
  const px = size * dotScale

  // The label counter-scales instead of disappearing, and is clamped so a long
  // title cannot grow into its neighbours.
  const showLabel = zoom >= MIN_LABEL_ZOOM
  const labelWidth = 120 * labelScale

  return (
    <div className="group flex flex-col items-center" style={{ width: size, opacity }}>
      <div
        className="rounded-full flex-shrink-0"
        style={{
          width: px,
          height: px,
          marginTop: tier === 'dot' ? (size - px) / 2 : 0,
          backgroundColor: style.dot,
          boxShadow: selected
            ? `0 0 0 ${3 * dotScale}px #6366f1`
            : data.pinned
              ? `0 0 0 ${2 * dotScale}px #374151`
              : `0 0 0 ${2 * dotScale}px rgba(255,255,255,.9)`,
        }}
      />
      {showLabel && (
        <div
          className="text-center leading-tight origin-top"
          style={{
            transform: `scale(${labelScale})`,
            width: labelWidth / labelScale,
            marginTop: 4,
          }}
        >
          <div className="text-[10px] font-medium text-gray-800"
            style={{
              overflowWrap: 'anywhere',
              // Two lines is enough to name a note and few enough that a dense
              // ring stays readable.
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              textShadow: '0 0 3px #fff, 0 0 3px #fff',
            }}
          >
            {data.title}
          </div>
          {data.todo && (
            <span className="text-[8px] font-bold text-rose-600">{data.todo}</span>
          )}
        </div>
      )}
      {handles}
    </div>
  )
})

type RingData = {
  ring: number
  label: string
  /** Shown under the label — today's date, or the horizon file's name. */
  sub?: string
  radius: number
  count: number
  /** Called by the caption itself — see the comment on the handler below. */
  onOpen?: (ring: number) => void
}

/**
 * The horizon rings themselves — the backdrop that makes a position mean
 * something. Drawn as circles rather than as a legend, so "how far out is this
 * thought" is answered by looking rather than by remembering.
 *
 * Purely decorative: the caption is RingLabelNode, which needs the opposite
 * stacking. This has to sit under the notes it encloses or its wash tints them.
 */
export const RingNode = memo(function RingNode({ data }: { data: RingData }) {
  const style = ringStyle(data.ring)

  return (
    <div
      className="rounded-full border-2 border-dashed pointer-events-none"
      style={{
        width: data.radius * 2,
        height: data.radius * 2,
        borderColor: style.ring,
      }}
    >
    </div>
  )
})

/**
 * A ring's caption, as a node of its own.
 *
 * Separate from the ring because the two want opposite stacking. The disc has
 * to sit under the notes it encloses or its wash tints them, which puts it
 * under the edge layer as well — and every edge carries an invisible 20px
 * interaction path, so near the centre where the lines converge the caption was
 * buried under a mat of them. Only the innermost ring was affected, which is
 * exactly where the edges are densest.
 */
export const RingLabelNode = memo(function RingLabelNode({ data }: { data: RingData }) {
  const zoom = useStore(selectZoom)
  const style = ringStyle(data.ring)
  const scale = Math.min(1 / Math.max(zoom, 0.02), 20)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => { e.stopPropagation(); data.onOpen?.(data.ring) }}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        data.onOpen?.(data.ring)
      }}
      title={`Open the ${data.label} note`}
      className="whitespace-nowrap cursor-pointer group"
      style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide px-1 rounded
                      bg-white/85 group-hover:bg-white group-hover:underline text-center"
        style={{ color: style.dot }}>
        {data.label} · {data.count}
      </div>
      {data.sub && (
        // On its own line under the label, and in the ring's own colour at full
        // weight: as a grey aside beside the name it was the least legible
        // thing on the canvas, which is the wrong place for the one label that
        // says which day you are looking at.
        <div className="text-[10px] font-semibold px-1 rounded bg-white/85 text-center -mt-0.5"
          style={{ color: style.dot }}>
          {data.sub}
        </div>
      )}
    </div>
  )
})

export const orgNodeTypes = { orgNode: OrgNode, ring: RingNode, ringLabel: RingLabelNode }
