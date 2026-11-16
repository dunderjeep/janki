'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { imageSrc, type GraphName, type LinkedPin } from '@/lib/porcupin/types'

/** The photos linked to a graph node. Takes up no room when there are none. */
export default function LinkedPins({ graph, nodeId, className = '' }: { graph: GraphName; nodeId: string; className?: string }) {
  const [pins, setPins] = useState<LinkedPin[]>([])

  useEffect(() => {
    let current = true
    setPins([])
    fetch(`/api/porcupin/linked?graph=${graph}&node=${encodeURIComponent(nodeId)}`)
      .then((r) => (r.ok ? r.json() : { pins: [] }))
      .then((json) => { if (current) setPins(json.pins) })
      .catch(() => {})
    return () => { current = false }
  }, [graph, nodeId])

  if (pins.length === 0) return null
  return (
    <div className={className}>
      <div className="flex gap-1.5 overflow-x-auto">
        {pins.map((p) => (
          <Link key={p.id} href={`/porcupin?pin=${encodeURIComponent(p.id)}`} title={p.title ?? p.filename} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(p.id, 'thumb')} alt={p.title ?? p.filename} className="h-14 w-14 rounded-md object-cover" />
          </Link>
        ))}
      </div>
    </div>
  )
}
