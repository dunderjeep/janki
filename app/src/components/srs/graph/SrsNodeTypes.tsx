'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import Link from 'next/link'

// ── Deck node ─────────────────────────────────────────────────────────────────

export type DeckNodeData = {
  label:  string
  deckId: string
  active: boolean
  total:  number
  due:    number
}

export const DeckNode = memo(function DeckNode({
  data,
  selected,
}: {
  data: DeckNodeData
  selected: boolean
}) {
  return (
    <div
      className={`
        min-w-[160px] max-w-[220px] rounded-xl border-2 px-3 py-2.5 shadow-sm
        bg-teal-50 border-teal-400 transition-all
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md' : 'hover:shadow-md'}
      `}
    >
      <Handle type="target" position={Position.Top}    className="!bg-teal-400  !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-teal-400  !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left}   className="!bg-teal-400  !w-2 !h-2 !opacity-50" />
      <Handle type="source" position={Position.Right}  className="!bg-teal-400  !w-2 !h-2 !opacity-50" />

      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-teal-100 text-teal-700 block mb-1.5 truncate w-fit">
        Deck
      </span>
      <div className="text-xs font-semibold text-gray-900 leading-snug mb-1 truncate" title={data.label}>
        {data.label}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>{data.total} cards</span>
        {data.due > 0 && (
          <span className="font-bold text-blue-600">{data.due} due</span>
        )}
      </div>
      {/* Navigation links — stopPropagation so clicks don't trigger ReactFlow drag */}
      <div className="flex gap-1.5 mt-2">
        <Link
          href={`/srs/${data.deckId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-teal-700 hover:underline font-medium"
        >
          Cards
        </Link>
        <span className="text-gray-300">·</span>
        <Link
          href={`/srs/${data.deckId}/graph`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-teal-700 hover:underline font-medium"
        >
          Graph
        </Link>
        {data.due > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <Link
              href={`/srs/${data.deckId}/study`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-blue-600 hover:underline font-medium"
            >
              Study
            </Link>
          </>
        )}
      </div>
    </div>
  )
})

// ── Card node ─────────────────────────────────────────────────────────────────

export type CardNodeData = {
  label:  string   // card front (truncated)
  back:   string
  cardId: string
  deckId: string
}

export const CardNode = memo(function CardNode({
  data,
  selected,
}: {
  data: CardNodeData
  selected: boolean
}) {
  return (
    <div
      className={`
        min-w-[140px] max-w-[200px] rounded-xl border-2 px-3 py-2.5 shadow-sm
        bg-amber-50 border-amber-400 transition-all
        ${selected ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md' : 'hover:shadow-md'}
      `}
    >
      <Handle type="target" position={Position.Top}    className="!bg-amber-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left}   className="!bg-amber-400 !w-2 !h-2 !opacity-50" />
      <Handle type="source" position={Position.Right}  className="!bg-amber-400 !w-2 !h-2 !opacity-50" />

      <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-700 block mb-1.5 truncate w-fit">
        Card
      </span>
      <div className="text-xs font-semibold text-gray-900 leading-snug mb-0.5 line-clamp-2" title={data.label}>
        {data.label}
      </div>
      {data.back && (
        <div className="text-[10px] text-gray-500 leading-snug line-clamp-1" title={data.back}>
          {data.back}
        </div>
      )}
      <div className="mt-1.5">
        <Link
          href={`/srs/${data.deckId}/cards/${data.cardId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-amber-700 hover:underline font-medium"
        >
          Edit
        </Link>
      </div>
    </div>
  )
})

export const srsNodeTypes = {
  srsDecNode:  DeckNode,
  srsCardNode: CardNode,
}
