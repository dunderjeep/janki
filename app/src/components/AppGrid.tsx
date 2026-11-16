'use client'

/**
 * Home-screen style grid of app icons. Hover an icon for its description;
 * drag icons to rearrange them, or hit Shuffle. The order is remembered in
 * this browser.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface AppTile {
  href: string
  title: string
  subtitle: string
  description: string
  glyph?: string
  /** Picture that fills the whole tile, used instead of a glyph */
  image?: string
  /** Tailwind gradient classes for the icon tile */
  tile: string
  /** The item you were last on, under the name. */
  caption?: string
  /** How many things are waiting, on the icon's corner. */
  badge?: number
  /** Where a tile not built into janki gets its caption and badge (same site, returns { caption?, badge?, image? }). */
  extrasUrl?: string
}

const STORAGE_KEY = 'janki:home-order'

function loadOrder(apps: AppTile[]): AppTile[] {
  try {
    const saved: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    const byHref = new Map(apps.map(a => [a.href, a]))
    const ordered = saved.flatMap(h => byHref.get(h) ?? [])
    // Apps added since the order was saved go on the end
    return [...ordered, ...apps.filter(a => !saved.includes(a.href))]
  } catch {
    return apps
  }
}

function saveOrder(apps: AppTile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(apps.map(a => a.href))) } catch {}
}

export default function AppGrid({ apps: initial }: { apps: AppTile[] }) {
  const [apps, setApps] = useState(initial)
  // A drag ends with a click on the link underneath; swallow it
  const justDragged = useRef(false)

  useEffect(() => { setApps(loadOrder(initial)) }, [initial])

  // Counts and last items, once the grid is up: from /api/dashboard, and again when you come back to the tab.
  const [extras, setExtras] = useState<Record<string, Partial<AppTile>>>({})
  useEffect(() => {
    let live = true
    const own = initial.filter((a) => a.extrasUrl?.startsWith('/'))
    const load = () => {
      fetch('/api/dashboard').then((r) => (r.ok ? r.json() : {})).then((x) => { if (live) setExtras((e) => ({ ...e, ...x })) }).catch(() => undefined)
      for (const a of own) {
        fetch(a.extrasUrl!).then((r) => (r.ok ? r.json() : null)).then((x) => { if (live && x) setExtras((e) => ({ ...e, [a.href]: x })) }).catch(() => undefined)
      }
    }
    void load()
    const again = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', again)
    return () => { live = false; document.removeEventListener('visibilitychange', again) }
  }, [initial])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const update = (next: AppTile[]) => { setApps(next); saveOrder(next) }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 0)
    if (!over || active.id === over.id) return
    const from = apps.findIndex(a => a.href === active.id)
    const to = apps.findIndex(a => a.href === over.id)
    update(arrayMove(apps, from, to))
  }

  const shuffle = () => {
    const next = [...apps]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    update(next)
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={shuffle}
          className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1 rounded-full border border-gray-200 hover:border-gray-400 transition-colors"
        >
          🔀 Shuffle
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={apps.map(a => a.href)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-10">
            {apps.map(app => (
              <Icon key={app.href} app={extras[app.href] ? { ...app, ...extras[app.href], image: extras[app.href].image ?? app.image } : app} justDragged={justDragged} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <p className="mt-10 text-center text-xs text-gray-400">Drag icons to rearrange them.</p>
    </div>
  )
}

function Icon({ app, justDragged }: { app: AppTile; justDragged: React.RefObject<boolean> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.href })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative flex justify-center ${isDragging ? 'z-20' : 'hover:z-10'}`}
      {...attributes}
      {...listeners}
    >
      <Link
        href={app.href}
        draggable={false}
        onClick={e => { if (justDragged.current) e.preventDefault() }}
        className="flex flex-col items-center gap-3 w-36 touch-manipulation"
      >
        <span
          className={`relative flex items-center justify-center w-32 h-32 rounded-[34px] bg-gradient-to-br shadow-lg text-6xl font-bold text-white transition-transform group-hover:scale-105 select-none ${app.tile} ${isDragging ? 'scale-110 shadow-xl' : ''}`}
        >
          {app.image
            ? <img src={app.image} alt="" draggable={false} className="w-full h-full rounded-[34px] object-cover" />
            : app.glyph}
          {app.badge ? (
            <span aria-label={`${app.badge} waiting`}
              className="absolute -right-2 -top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-red-600 px-2 text-sm font-semibold text-white shadow ring-2 ring-white">
              {app.badge > 99 ? '99+' : app.badge}
            </span>
          ) : null}
        </span>
        <span className="flex w-36 flex-col items-center">
          <span className="text-base font-medium text-gray-800 text-center leading-tight">{app.title}</span>
          {app.caption && <span className="mt-0.5 w-full truncate text-center text-xs text-gray-500" title={app.caption}>{app.caption}</span>}
        </span>
      </Link>

      {/* Tooltip */}
      {!isDragging && (
        <div className="pointer-events-none absolute top-full mt-2 w-64 z-10 rounded-xl bg-gray-900 px-3 py-2.5 text-left shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 group-hover:delay-300">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{app.subtitle}</div>
          <p className="text-xs leading-relaxed text-gray-100">{app.description}</p>
        </div>
      )}
    </div>
  )
}
