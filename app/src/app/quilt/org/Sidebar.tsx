'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const MIN = 200
const MAX = 560
const DEFAULT = 256
const KEY = 'quilt-org-sidebar'

/**
 * The canvas sidebar: collapsible, and resizable by its edge.
 *
 * The width and collapsed state are per-browser conveniences, so they live in
 * localStorage rather than in the database. Reading is wrapped because a
 * private window, cleared site data, or a thumbnail capture can all make the
 * accessor throw rather than merely return null.
 */
function readStored(): { w: number; collapsed: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { w: DEFAULT, collapsed: false }
    const v = JSON.parse(raw) as { w?: number; collapsed?: boolean }
    return {
      w: Math.min(MAX, Math.max(MIN, Number(v.w) || DEFAULT)),
      collapsed: Boolean(v.collapsed),
    }
  } catch {
    return { w: DEFAULT, collapsed: false }
  }
}

export default function Sidebar({ children }: { children: ReactNode }) {
  // Start at the default and adopt the stored value after mount: reading
  // localStorage during render would differ between server and client.
  const [width, setWidth] = useState(DEFAULT)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const asideRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const s = readStored()
    setWidth(s.w)
    setCollapsed(s.collapsed)
  }, [])

  const persist = useCallback((w: number, c: boolean) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ w, collapsed: c }))
    } catch {
      // Not being able to remember the width is not worth failing over.
    }
  }, [])

  // Listeners go on the window, not the handle: the pointer routinely leaves a
  // 4px strip mid-drag, and a handle-bound listener drops the gesture there.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0
      setWidth(Math.min(MAX, Math.max(MIN, e.clientX - left)))
    }
    const onUp = () => {
      setDragging(false)
      setWidth(w => { persist(w, collapsed); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // Without this the drag selects the sidebar's text as it goes.
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = prev
    }
  }, [dragging, collapsed, persist])

  const toggle = useCallback(() => {
    setCollapsed(c => {
      persist(width, !c)
      return !c
    })
  }, [width, persist])

  if (collapsed) {
    return (
      <div className="flex-shrink-0 border-r border-gray-200 bg-white flex flex-col items-center py-2">
        <button
          onClick={toggle}
          title="Show the sidebar"
          className="w-7 h-7 rounded flex items-center justify-center
                     text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          ›
        </button>
      </div>
    )
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden"
      style={{ width }}
    >
      <button
        onClick={toggle}
        title="Hide the sidebar"
        className="absolute top-1 right-1 z-10 w-6 h-6 rounded flex items-center justify-center
                   text-gray-300 hover:text-gray-700 hover:bg-gray-100"
      >
        ‹
      </button>

      {/* Scrolls as a whole: with routine, search, rings, drift and a selection
          all present the column is easily taller than the viewport. mt-auto on
          the footer still pins it to the bottom when it is not. */}
      <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>

      {/* The grab strip. Sits over the border so the whole edge is the target. */}
      <div
        onMouseDown={() => setDragging(true)}
        onDoubleClick={() => { setWidth(DEFAULT); persist(DEFAULT, false) }}
        title="Drag to resize · double-click to reset"
        className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize
                    ${dragging ? 'bg-indigo-400' : 'hover:bg-indigo-200'}`}
      />
    </aside>
  )
}
