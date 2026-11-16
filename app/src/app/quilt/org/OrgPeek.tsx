'use client'

import { useEffect, useRef, useState } from 'react'
import type { OrgGraphNode } from './orgGraph'

const W = 280
const GAP = 16

/**
 * Hover preview for a note.
 *
 * The canvas can now hold a legible label at any zoom, but a label is a name,
 * not a summary. This is the layer that answers "what is this and what does it
 * touch" without a click and without leaving the pulled-back view.
 */
export default function OrgPeek({
  node, x, y, ring, degree, neighbours, onOpen, onMouseEnter, onMouseLeave,
}: {
  node: OrgGraphNode
  x: number
  y: number
  ring: { label: string; dot: string }
  degree: number
  neighbours: { title: string; dir: '→' | '←'; label: string | null }[]
  onOpen: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [h, setH] = useState(160)

  useEffect(() => { if (box.current) setH(box.current.offsetHeight) }, [node, neighbours])

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const left = x + GAP + W > vw ? Math.max(8, x - GAP - W) : x + GAP
  const top = y + GAP + h > vh ? Math.max(8, vh - h - 8) : y + GAP

  return (
    <div
      ref={box}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
      style={{ left, top, width: W }}
    >
      <div className="h-0.5" style={{ backgroundColor: ring.dot }} />
      <div className="p-2.5 space-y-1.5">
        <div className="text-xs font-semibold text-gray-900 leading-snug">{node.title}</div>
        <div className="text-[10px] text-gray-400">
          {ring.label}
          {node.age !== null && node.age > 0 && ` · carried ${node.age}d`}
          {' · '}{degree} link{degree === 1 ? '' : 's'}
        </div>
        {node.tags.length > 0 && (
          <div className="text-[10px] text-gray-500">{node.tags.join(', ')}</div>
        )}

        {neighbours.length > 0 && (
          <div className="pt-1 border-t border-gray-100">
            {neighbours.map((n, i) => (
              <div key={i} className="flex gap-1 text-[10px] leading-snug">
                <span className="text-gray-400 flex-shrink-0">{n.dir}</span>
                {n.label && <span className="text-indigo-600 flex-shrink-0">{n.label}</span>}
                <span className="text-gray-600 truncate">{n.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex border-t border-gray-100">
        <button onClick={onOpen}
          className="flex-1 py-1 text-[10px] text-gray-500 hover:bg-gray-50">
          Select
        </button>
      </div>
    </div>
  )
}
