'use client'

/**
 * The row of app icons at the top. Drag an icon sideways to move it (on a
 * phone, hold it first); the order is remembered in this browser, the way the
 * home screen's grid is. Apps added later go on the end.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DailyDot, { type DailyActivity } from './DailyDot'

/** `counted`: the icon shows how many are waiting there (from /api/dashboard). */
export type NavItem = { href: string; label: string; icon: ReactNode; daily?: DailyActivity; counted?: boolean }

const STORAGE_KEY = 'janki:nav-order'

function ordered(items: NavItem[]): NavItem[] {
  try {
    const saved: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    const byHref = new Map(items.map((i) => [i.href, i]))
    return [...saved.flatMap((h) => byHref.get(h) ?? []), ...items.filter((i) => !saved.includes(i.href))]
  } catch {
    return items
  }
}

function Icon({ item, justDragged, count }: { item: NavItem; justDragged: React.RefObject<boolean>; count?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'relative z-10' : ''}>
      <Link
        href={item.href}
        title={item.label}
        aria-label={count ? `${item.label}, ${count} waiting` : item.label}
        draggable={false}
        // The click that ends a drag is not a visit.
        onClick={(e) => { if (justDragged.current) e.preventDefault() }}
        {...attributes}
        {...listeners}
        // Still a link to screen readers, not the "button" dnd-kit would make it.
        role={undefined}
        className={`relative flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors touch-pan-x ${isDragging ? 'bg-indigo-50 text-indigo-600 shadow' : ''}`}
      >
        {item.icon}
        {item.daily && <DailyDot activity={item.daily} label={item.label} />}
        {count ? (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

export default function NavBar({ items }: { items: NavItem[] }) {
  // The server's order first; this browser's own order once it has loaded.
  const [list, setList] = useState(items)
  useEffect(() => setList(ordered(items)), [items])
  const justDragged = useRef(false)

  // Counts for the icons that have them: on each page change, and when the tab comes back.
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const countedHrefs = items.filter((i) => i.counted).map((i) => i.href).join(',')
  useEffect(() => {
    if (!countedHrefs) return
    let live = true
    const load = () => fetch(`/api/dashboard?only=${encodeURIComponent(countedHrefs)}`).then((r) => (r.ok ? r.json() : {}))
      .then((x: Record<string, { badge?: number }>) => { if (live) setCounts(Object.fromEntries(Object.entries(x).map(([h, v]) => [h, v.badge ?? 0]))) })
      .catch(() => undefined)
    void load()
    const again = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', again)
    // An app says something it counts has changed (Mail, after each email dealt with).
    const changed = () => void load()
    window.addEventListener('janki:counts', changed)
    return () => { live = false; document.removeEventListener('visibilitychange', again); window.removeEventListener('janki:counts', changed) }
  }, [countedHrefs, pathname])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    justDragged.current = true
    setTimeout(() => { justDragged.current = false }, 0)
    if (!over || active.id === over.id) return
    setList((l) => {
      const next = arrayMove(l, l.findIndex((i) => i.href === active.id), l.findIndex((i) => i.href === over.id))
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((i) => i.href))) } catch {}
      return next
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => { justDragged.current = true }} onDragEnd={onDragEnd} onDragCancel={() => { justDragged.current = false }}>
      <SortableContext items={list.map((i) => i.href)} strategy={horizontalListSortingStrategy}>
        <ul className="flex items-center gap-1">
          {list.map((item) => <Icon key={item.href} item={item} justDragged={justDragged} count={counts[item.href]} />)}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
