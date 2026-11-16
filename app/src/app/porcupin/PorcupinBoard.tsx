'use client'

/**
 * The board: a masonry of photos with a drop tile always in the first slot.
 *
 * Everything is held in the browser once loaded, so search and sort are instant
 * and need no paging. Columns are filled shortest-first from stored dimensions,
 * so the order reads left to right and nothing shifts as images arrive.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { imageSrc, youtubeId, type BoardView, type PinView } from '@/lib/porcupin/types'
import { api, jsonBody, readTransfer, uploadFile, uploadUrl, type UploadResult } from './intake'
import PinModal from './PinModal'

const PIN_TYPE = 'application/x-porcupin-pin'
const ALL = 'all'
const PAGE = 60
const COLUMN_MIN = 236
const GAP = 16
const MAX_RATIO = 2.5
const CONCURRENT_UPLOADS = 3

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'title-desc', label: 'Title Z–A' },
] as const
type Sort = (typeof SORTS)[number]['value']

const ratioOf = (pin: PinView) => (pin.width && pin.height ? Math.min(MAX_RATIO, pin.height / pin.width) : 1)

function matches(pin: PinView, tokens: string[], boardName: Map<string, string>): boolean {
  if (tokens.length === 0) return true
  const haystack = [
    pin.title, pin.description, pin.filename, pin.sourceUrl,
    ...pin.links.map((l) => l.label),
    ...pin.boardIds.map((id) => boardName.get(id)),
  ].join(' ').toLowerCase()
  return tokens.every((t) => haystack.includes(t))
}

/** Pins with no title sort after the titled ones, whichever way the titles run. */
function compare(sort: Sort) {
  const recent = (a: PinView, b: PinView) => b.createdAt.localeCompare(a.createdAt)
  if (sort === 'recent') return recent
  if (sort === 'oldest') return (a: PinView, b: PinView) => a.createdAt.localeCompare(b.createdAt)
  const dir = sort === 'title' ? 1 : -1
  return (a: PinView, b: PinView) => {
    if (a.title && b.title) return dir * a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || recent(a, b)
    return Number(!a.title) - Number(!b.title) || recent(a, b)
  }
}

const isFromOutside = (types: readonly string[]) =>
  !types.includes(PIN_TYPE) && ['Files', 'text/uri-list', 'text/html', 'text/plain'].some((t) => types.includes(t))

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export default function PorcupinBoard({
  initialPins, initialBoards, initialSearch,
}: {
  initialPins: PinView[]
  initialBoards: BoardView[]
  initialSearch: { project?: string; q?: string; sort?: string; pin?: string }
}) {
  const [pins, setPins] = useState(initialPins)
  const [boards, setBoards] = useState(initialBoards)
  const [active, setActive] = useState(
    initialBoards.some((b) => b.id === initialSearch.project) ? initialSearch.project! : ALL,
  )
  const [query, setQuery] = useState(initialSearch.q ?? '')
  const [sort, setSort] = useState<Sort>(
    SORTS.find((s) => s.value === initialSearch.sort)?.value ?? 'recent',
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [notes, setNotes] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [columnCount, setColumnCount] = useState(5)

  // Opened after mount, because the photo view shows a date in the browser's
  // locale and the server cannot render that the same way.
  useEffect(() => {
    if (initialPins.some((p) => p.id === initialSearch.pin)) setOpenId(initialSearch.pin!)
  }, [initialPins, initialSearch.pin])

  const fileInput = useRef<HTMLInputElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const runningBatches = useRef(0)

  const note = useCallback((text: string) => setNotes((n) => [...n, text]), [])

  const mergePin = useCallback((pin: PinView) => {
    setPins((all) => (all.some((p) => p.id === pin.id) ? all.map((p) => (p.id === pin.id ? pin : p)) : [pin, ...all]))
  }, [])

  const runJobs = useCallback(async (jobs: { name: string; run: () => Promise<UploadResult> }[]) => {
    runningBatches.current += 1
    setProgress((p) => ({ ...p, total: p.total + jobs.length }))
    let next = 0
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++]
        try {
          const { pin, duplicate } = await job.run()
          mergePin(pin)
          if (duplicate) note(`${job.name} was already here, so no second copy was made.`)
        } catch (err) {
          note(`${job.name}: ${(err as Error).message}`)
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENT_UPLOADS }, worker))
    runningBatches.current -= 1
    if (runningBatches.current === 0) setProgress({ done: 0, total: 0 })
  }, [mergePin, note])

  /** `quiet` is for paste, where ordinary text on the clipboard is not a mistake. */
  const receive = useCallback((data: DataTransfer, boardId: string | null, quiet = false) => {
    const { files, urls, source, rejected } = readTransfer(data)
    if (rejected > 0) note(`${rejected} file${rejected === 1 ? ' was' : 's were'} skipped: only images can be pinned.`)
    if (files.length === 0 && urls.length === 0) {
      if (!quiet && rejected === 0) note('That had no image or link in it.')
      return
    }
    void runJobs([
      ...files.map((f) => ({ name: f.name, run: () => uploadFile(f, boardId, source) })),
      ...urls.map((u) => ({
        name: u.startsWith('data:') ? 'Pasted image' : new URL(u).hostname,
        run: () => uploadUrl(u, boardId),
      })),
    ])
  }, [note, runJobs])

  // Listening on window means a drop anywhere works, and a near miss on the
  // tile adds the photo rather than navigating the tab away to it.
  useEffect(() => {
    let depth = 0
    const target = () => (activeRef.current === ALL ? null : activeRef.current)
    const outside = (e: globalThis.DragEvent) => isFromOutside(Array.from(e.dataTransfer?.types ?? []))
    const onEnter = (e: globalThis.DragEvent) => { if (outside(e)) { depth += 1; setDragging(true) } }
    const onLeave = (e: globalThis.DragEvent) => {
      if (outside(e) && --depth <= 0) { depth = 0; setDragging(false) }
    }
    const onOver = (e: globalThis.DragEvent) => { if (outside(e) && !isEditable(e.target)) e.preventDefault() }
    const onDrop = (e: globalThis.DragEvent) => {
      depth = 0
      setDragging(false)
      // Already taken by a project chip, or text being dropped into a field.
      if (e.defaultPrevented || !e.dataTransfer || !outside(e) || isEditable(e.target)) return
      e.preventDefault()
      receive(e.dataTransfer, target())
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !e.clipboardData) return
      receive(e.clipboardData, target(), true)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [receive])

  const boardName = useMemo(() => new Map(boards.map((b) => [b.id, b.name])), [boards])
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of pins) for (const b of p.boardIds) c.set(b, (c.get(b) ?? 0) + 1)
    return c
  }, [pins])

  const shown = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    return pins
      .filter((p) => (active === ALL || p.boardIds.includes(active)) && matches(p, tokens, boardName))
      .sort(compare(sort))
  }, [pins, active, query, sort, boardName])

  useEffect(() => setLimit(PAGE), [active, query, sort])

  useEffect(() => {
    const params = new URLSearchParams()
    if (active !== ALL) params.set('project', active)
    if (query) params.set('q', query)
    if (sort !== 'recent') params.set('sort', sort)
    if (openId) params.set('pin', openId)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/porcupin?${qs}` : '/porcupin')
  }, [active, query, sort, openId])

  useEffect(() => {
    const el = grid.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setColumnCount(Math.max(2, Math.floor((entry.contentRect.width + GAP) / (COLUMN_MIN + GAP))))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setLimit((l) => l + PAGE) },
      { rootMargin: '800px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo(() => {
    const cols: PinView[][] = Array.from({ length: columnCount }, () => [])
    const heights = new Array<number>(columnCount).fill(0)
    heights[0] = 1 // the drop tile
    for (const pin of shown.slice(0, limit)) {
      const i = heights.indexOf(Math.min(...heights))
      cols[i].push(pin)
      heights[i] += ratioOf(pin) + (pin.title || pin.description ? 0.2 : 0) + 0.06
    }
    return cols
  }, [shown, limit, columnCount])

  const patchPin = useCallback(async (id: string, body: object) => {
    try {
      mergePin(await api<PinView>(`/api/porcupin/pins/${id}`, jsonBody('PATCH', body)))
    } catch (err) {
      note((err as Error).message)
    }
  }, [mergePin, note])

  const openIndex = shown.findIndex((p) => p.id === openId)
  const openPin = pins.find((p) => p.id === openId) ?? null

  const deletePin = async (id: string) => {
    try {
      await api(`/api/porcupin/pins/${id}`, { method: 'DELETE' })
      setOpenId(null)
      setPins((all) => all.filter((p) => p.id !== id))
    } catch (err) {
      note((err as Error).message)
    }
  }

  const createProject = async (name: string) => {
    try {
      const board = await api<BoardView>('/api/porcupin/boards', jsonBody('POST', { name }))
      setBoards((b) => [...b, board].sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' })))
      setActive(board.id)
    } catch (err) {
      note((err as Error).message)
    }
  }

  const renameProject = async (name: string) => {
    try {
      const board = await api<BoardView>(`/api/porcupin/boards/${active}`, jsonBody('PATCH', { name }))
      setBoards((all) => all.map((b) => (b.id === board.id ? board : b)))
    } catch (err) {
      note((err as Error).message)
    }
  }

  const deleteProject = async () => {
    const name = boardName.get(active)
    const n = counts.get(active) ?? 0
    if (!window.confirm(`Delete the project “${name}”? Its ${n} photo${n === 1 ? '' : 's'} will stay in ALL.`)) return
    try {
      await api(`/api/porcupin/boards/${active}`, { method: 'DELETE' })
      const gone = active
      setBoards((b) => b.filter((x) => x.id !== gone))
      setPins((all) => all.map((p) => ({ ...p, boardIds: p.boardIds.filter((b) => b !== gone) })))
      setActive(ALL)
    } catch (err) {
      note((err as Error).message)
    }
  }

  const dropOnChip = (e: DragEvent, boardId: string | null) => {
    e.preventDefault()
    const pinId = e.dataTransfer.getData(PIN_TYPE)
    if (pinId) {
      if (boardId) void patchPin(pinId, { addBoard: boardId })
    } else {
      receive(e.dataTransfer, boardId)
    }
  }

  const uploading = progress.total > 0
  const activeName = active === ALL ? null : boardName.get(active)

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mr-2">Porcupin</h1>
        <div className="relative flex-1 min-w-[12rem]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, descriptions, projects, linked notes…"
            aria-label="Search photos"
            className="w-full rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <ProjectChip selected={active === ALL} onClick={() => setActive(ALL)} onDrop={(e) => dropOnChip(e, null)}>
          ALL <Count n={pins.length} />
        </ProjectChip>
        {boards.map((b) =>
          naming === 'rename' && active === b.id ? (
            <NameInput key={b.id} initial={b.name} onCancel={() => setNaming(null)}
              onCommit={(name) => { setNaming(null); void renameProject(name) }} />
          ) : (
            <ProjectChip key={b.id} selected={active === b.id} onClick={() => setActive(b.id)} onDrop={(e) => dropOnChip(e, b.id)}>
              {b.name} <Count n={counts.get(b.id) ?? 0} />
            </ProjectChip>
          ),
        )}
        {naming === 'new' ? (
          <NameInput initial="" onCancel={() => setNaming(null)}
            onCommit={(name) => { setNaming(null); void createProject(name) }} />
        ) : (
          <button onClick={() => setNaming('new')}
            className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-amber-500 hover:text-amber-800">
            + New project
          </button>
        )}
        {activeName && naming === null && (
          <span className="ml-1 flex gap-3 text-xs text-gray-500">
            <button className="hover:text-gray-900" onClick={() => setNaming('rename')}>Rename</button>
            <button className="hover:text-red-700" onClick={deleteProject}>Delete project</button>
          </span>
        )}
      </div>

      {notes.length > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-start justify-between gap-4">
            <ul className="space-y-1 min-w-0">
              {notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}
            </ul>
            <button onClick={() => setNotes([])} className="shrink-0 text-amber-800 hover:underline">Dismiss</button>
          </div>
        </div>
      )}

      <div ref={grid} className="flex items-start" style={{ gap: GAP }}>
        {columns.map((col, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col" style={{ gap: GAP }}>
            {i === 0 && (
              <button
                onClick={() => fileInput.current?.click()}
                className={`aspect-square w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-4 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  dragging ? 'border-amber-600 bg-amber-100 text-amber-900' : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-900'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5" /><path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
                </svg>
                {uploading ? (
                  <span className="text-sm font-medium">Adding {Math.min(progress.done + 1, progress.total)} of {progress.total}…</span>
                ) : (
                  <>
                    <span className="text-sm font-medium [@media(pointer:coarse)]:hidden">{dragging ? 'Drop to add' : 'Drop photos or links here'}</span>
                    <span className="hidden text-sm font-medium [@media(pointer:coarse)]:inline">Add photos</span>
                  </>
                )}
                <span className="text-xs opacity-80">
                  <span className="[@media(pointer:coarse)]:hidden">or paste with Ctrl+V, or click to browse</span>
                  <span className="hidden [@media(pointer:coarse)]:inline">from your photo library or camera</span>
                  {activeName ? ` · adds to ${activeName}` : ''}
                </span>
              </button>
            )}
            {col.map((pin) => <PinTile key={pin.id} pin={pin} onOpen={setOpenId} />)}
          </div>
        ))}
      </div>

      {shown.length === 0 && pins.length > 0 && (
        <p className="mt-8 text-center text-sm text-gray-500">
          {query ? `Nothing matches “${query}”.` : 'This project is empty. Drop photos on it, or drag some here from ALL.'}
        </p>
      )}
      <div ref={sentinel} className="h-px" />

      <input
        ref={fileInput} type="file" multiple hidden
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void runJobs(files.map((f) => ({ name: f.name, run: () => uploadFile(f, active === ALL ? null : active, null) })))
        }}
      />

      {dragging && (
        <div className="fixed inset-2 z-30 pointer-events-none rounded-2xl border-4 border-dashed border-amber-500 flex items-end justify-center pb-6">
          <span className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            Drop anywhere to add to {activeName ?? 'ALL'}, or onto a project above
          </span>
        </div>
      )}

      {openPin && (
        <PinModal
          key={openPin.id}
          pin={openPin}
          boards={boards}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(shown[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < shown.length - 1 ? () => setOpenId(shown[openIndex + 1].id) : null}
          onPatch={patchPin}
          onDelete={deletePin}
          onPinChanged={mergePin}
          onError={note}
        />
      )}
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 opacity-60 tabular-nums">{n}</span>
}

function ProjectChip({ selected, onClick, onDrop, children }: {
  selected: boolean
  onClick: () => void
  onDrop: (e: DragEvent) => void
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <button
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); onDrop(e) }}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        over ? 'bg-amber-500 text-white' : selected ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function NameInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const finish = () => {
    const name = value.trim()
    if (name && name !== initial) onCommit(name)
    else onCancel()
  }
  return (
    <input
      autoFocus value={value} maxLength={60} placeholder="Project name" aria-label="Project name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish()
        if (e.key === 'Escape') onCancel()
      }}
      className="rounded-full border border-amber-500 px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-amber-500"
    />
  )
}

const PinTile = memo(function PinTile({ pin, onOpen }: { pin: PinView; onOpen: (id: string) => void }) {
  const label = pin.title ?? pin.filename
  return (
    <div
      role="button" tabIndex={0} aria-label={`Open ${label}`} draggable
      onClick={() => onOpen(pin.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(pin.id) }}
      onDragStart={(e) => { e.dataTransfer.setData(PIN_TYPE, pin.id); e.dataTransfer.effectAllowed = 'copy' }}
      className="group cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-2xl"
    >
      <div className="relative overflow-hidden rounded-2xl bg-gray-100" style={{ aspectRatio: `1 / ${ratioOf(pin)}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc(pin.id, 'thumb')} alt={label} loading="lazy" draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
        {youtubeId(pin.sourceUrl) && (
          <span className="absolute inset-0 flex items-center justify-center" aria-label="Video">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 pl-1 text-lg text-white">▶</span>
          </span>
        )}
        {pin.links.length > 0 && (
          <span title={pin.links.map((l) => l.label).join(', ')} className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            ⛓ {pin.links.length}
          </span>
        )}
      </div>
      {(pin.title || pin.description) && (
        <div className="px-1 pt-1.5">
          {pin.title && <p className="text-sm font-medium text-gray-900 truncate">{pin.title}</p>}
          {pin.description && <p className="text-xs text-gray-500 line-clamp-2">{pin.description}</p>}
        </div>
      )}
    </div>
  )
})
