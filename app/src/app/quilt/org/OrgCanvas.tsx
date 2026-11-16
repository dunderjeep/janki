'use client'

import 'reactflow/dist/style.css'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import ReactFlow, {
  Background, Controls,
  useNodesState, useEdgesState, ReactFlowProvider, useReactFlow, useStore,
  type NodeDragHandler, type Node as RFNode, type Edge as RFEdge, type Connection,
} from 'reactflow'
import { orgNodeTypes } from './OrgNodes'
import RoutinePanel from './RoutinePanel'
import CalendarPanel from './CalendarPanel'
import TasksPanel from './TasksPanel'
import WishlistPanel from './WishlistPanel'
import ShortcutsButton from './ShortcutsButton'
import OrgPeek from './OrgPeek'
import LinkPrompt from './LinkPrompt'
import ConnectionsPanel from './ConnectionsPanel'
import NoteCard, { CARD_W, CARD_GAP } from './NoteCard'
import Sidebar from './Sidebar'
import RingSettingsPanel, { readRingSettings } from './RingSettings'
import { HighlightContext } from './OrgNodes'
import {
  layout, toRFNodes, toRFEdges, degreeOf, ringStyle, unreachedGoals, drifted,
  computeRingRadii, neighbourhood, toPolar, PERIPHERY_RING, DEFAULT_RING_SETTINGS,
  type OrgGraphNode, type OrgGraphLink, type OrgPosition, type OrgHorizon,
  type RingSettings,
} from './orgGraph'

type Payload = {
  nodes: OrgGraphNode[]
  links: OrgGraphLink[]
  positions: OrgPosition[]
  horizons: OrgHorizon[]
}

function Canvas() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<OrgGraphNode | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showPeriphery, setShowPeriphery] = useState(false)
  const [query, setQuery] = useState('')
  const { setCenter, getViewport } = useReactFlow()
  const paneW = useStore(s => s.width)
  const paneH = useStore(s => s.height)

  // Adopted after mount rather than read during render: localStorage is not
  // available on the server and reading it here would mismatch the markup.
  const [ringSettings, setRingSettings] = useState<RingSettings>(DEFAULT_RING_SETTINGS)
  useEffect(() => { setRingSettings(readRingSettings()) }, [])

  // Hover peek — same contract as the SRS canvas: a delay on the way in so
  // sweeping the pointer does not strobe, and a grace period on the way out so
  // the card can be moved onto.
  const [peek, setPeek] = useState<{ node: OrgGraphNode; x: number; y: number } | null>(null)
  const peekIn = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekOut = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ?focus=<org-id> opens the canvas on one note, for links from elsewhere in janki.
  const focusId = useMemo(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('focus')
  }, [])
  const centred = useRef(false)

  useEffect(() => {
    fetch('/api/org/graph')
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error))))
      .then(setData)
      .catch(e => setError(String(e.message ?? e)))
  }, [])

  const visibleNodes = useMemo(() => {
    if (!data) return []
    // The periphery is 1148 of 1232 notes. Off by default: the rings are the
    // point, and drawing the whole roam graph buries them.
    const base = showPeriphery ? data.nodes : data.nodes.filter(n => n.ring < PERIPHERY_RING)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return data.nodes.filter(n => n.title.toLowerCase().includes(q))
  }, [data, showPeriphery, query])

  const degree = useMemo(() => degreeOf(data?.links ?? []), [data])

  const ringCounts = useMemo(() => {
    const c = new Array(PERIPHERY_RING + 1).fill(0)
    for (const n of data?.nodes ?? []) c[n.ring] = (c[n.ring] ?? 0) + 1
    return c
  }, [data])

  // One pass of arithmetic over six rings, not a simulation. Recomputed only
  // when the graph reloads.
  const radii = useMemo(
    () => computeRingRadii(ringCounts, ringSettings),
    [ringCounts, ringSettings]
  )

  useEffect(() => { radiiRef.current = radii }, [radii])

  const positions = useMemo(
    () => (data ? layout(data.nodes, data.positions, radii) : new Map()),
    [data, radii]
  )

  /**
   * Convert placements saved before polar placement existed.
   *
   * One batched write on the first load after the upgrade. Without it, notes
   * pinned earlier would keep their frozen coordinates and go on being
   * swallowed by whichever band was widened next — the exact problem this is
   * meant to fix, still present on the 43 notes already placed.
   */
  useEffect(() => {
    if (!data || radii.length === 0 || backfilled.current) return
    const stale = data.positions.filter(p => p.angle === null || p.bandT === null || p.placedRing === null)
    if (stale.length === 0) return
    backfilled.current = true
    const converted = stale.map(p => ({
      orgId: p.orgId, x: p.x, y: p.y, pinned: p.pinned, ...toPolar(p.x, p.y, radii),
    }))
    fetch('/api/org/positions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: converted }),
    })
      .then(() => setData(d => (d ? {
        ...d,
        positions: d.positions.map(p => converted.find(c => c.orgId === p.orgId) ?? p),
      } : d)))
      .catch(() => {})
  }, [data, radii])

  /** Opens where a task or agenda entry lives: its nearest linkable note's card. */
  const peekOrgLocation = useCallback((file: string, _pos: number, node: string | null) => {
    const target = (node && data?.nodes.find(n => n.id === node)) || data?.nodes.find(n => n.file === file && n.level === 0)
    if (target) {
      focusRef.current(target.id, { center: true })
      return
    }
    setStatus(`${file} has no linkable note to open`)
    setTimeout(() => setStatus(null), 4000)
  }, [data])

  // Kept current by an effect next to focusNode, which is declared below.
  const focusRef = useRef<(id: string, opts: { center: boolean }) => void>(() => {})

  /** A ring's label opens the note that names it: this week, this month, … */
  const openHorizon = useCallback((ring: number) => {
    const h = data?.horizons.find(x => x.ring === ring)
    if (!h) return
    const note = data?.nodes.find(n => n.file === h.file)
    if (note) {
      focusRef.current(note.id, { center: true })
      return
    }
    setStatus(`no ${h.name} note yet (${h.file})`)
    setTimeout(() => setStatus(null), 4000)
  }, [data])

  /** Re-read the graph — after an edit, whose links may have changed. */
  const reload = useCallback(async () => {
    const res = await fetch('/api/org/graph')
    if (res.ok) setData(await res.json())
  }, [])

  // A card mid-edit must not be closed by a stray click on the canvas.
  const editingRef = useRef(false)
  const onEditingChange = useCallback((e: boolean) => { editingRef.current = e }, [])

  const todayLabel = useMemo(() => {
    const d = new Date()
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }, [])

  const rfNodes = useMemo(() => {
    if (!data) return []
    const out: RFNode[] = []

    // Rings first, behind everything, non-interactive.
    const counts = new Map<number, number>()
    for (const n of data.nodes) counts.set(n.ring, (counts.get(n.ring) ?? 0) + 1)
    const maxRing = showPeriphery ? PERIPHERY_RING : PERIPHERY_RING - 1
    for (let ring = 0; ring <= maxRing; ring++) {
      const style = ringStyle(ring)
      const r = radii[ring]
      const data = {
        ring,
        label: style.label,
        // The centre ring names the day it is actually showing, so a canvas
        // left open overnight cannot quietly claim to be today.
        sub: ring === 0 ? todayLabel : undefined,
        radius: r,
        count: counts.get(ring) ?? 0,
        onOpen: openHorizon,
      }

      out.push({
        id: `ring:${ring}`,
        type: 'ring',
        position: { x: -r, y: -r },
        draggable: false,
        selectable: false,
        zIndex: -1,
        style: { pointerEvents: 'none' },
        data,
      })

      // The caption rides above everything, including the edge layer. Its own
      // node so it is not stuck at the disc's z-index — see RingLabelNode.
      out.push({
        id: `ringLabel:${ring}`,
        type: 'ringLabel',
        position: { x: 0, y: -r + 4 },
        draggable: false,
        selectable: false,
        zIndex: 20,
        data,
      })
    }

    out.push(...toRFNodes(visibleNodes, positions, degree))
    return out
  }, [data, visibleNodes, positions, degree, showPeriphery, radii, todayLabel, openHorizon])

  const rfEdges: RFEdge[] = useMemo(
    () => toRFEdges(data?.links ?? [], new Set(visibleNodes.map(n => n.id)), selected?.id),
    [data, visibleNodes, selected]
  )

  /** The selection and everything it links to — what stays lit on the canvas. */
  const highlight = useMemo(
    () => (selected && data ? neighbourhood(selected.id, data.links) : null),
    [selected, data]
  )

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(rfNodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(rfEdges)
  useEffect(() => { setFlowNodes(rfNodes) }, [rfNodes, setFlowNodes])
  useEffect(() => { setFlowEdges(rfEdges) }, [rfEdges, setFlowEdges])

  // Debounced position save — one request per gesture, not per pointer event.
  const queue = useRef<Record<string, OrgPosition>>({})
  // Read at drop time by onNodeDragStop, which is the only place geometry is
  // needed — the flush just posts what was already decided.
  const radiiRef = useRef<number[]>([])
  /** The conversion below is a one-off; a failed write must not retry forever. */
  const backfilled = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    // Posts exactly what onNodeDragStop put into local state, rather than
    // recomputing from the geometry 400ms later — a slider moved in between
    // would otherwise persist a placement the canvas is not showing.
    const positions = Object.values(queue.current)
    queue.current = {}
    if (positions.length === 0) return
    await fetch('/api/org/positions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    })
    setStatus(`placed ${positions.length}`)
    setTimeout(() => setStatus(null), 1500)
  }, [])

  /**
   * Dragging is the whole point, so every drop is durable.
   *
   * The placement is written into local state here, not only sent to the
   * server. `positions` is memoised over `data.positions`, so anything that
   * recomputes the layout — resizing a band, above all — rebuilt from the copy
   * the server last sent and threw away every drag made since the page loaded.
   * Moving a note and then touching a slider put it back where it started.
   */
  const onNodeDragStop: NodeDragHandler = useCallback((_, node, nodes) => {
    const moved = (nodes?.length ? nodes : [node])
      .filter(n => n.type !== 'ring' && n.type !== 'ringLabel')
    if (moved.length === 0) return

    const placed = moved.map(n => ({
      orgId: n.id,
      x: n.position.x,
      y: n.position.y,
      pinned: true,
      ...toPolar(n.position.x, n.position.y, radiiRef.current),
    }))

    setData(d => {
      if (!d) return d
      const byId = new Map(placed.map(p => [p.orgId, p]))
      const kept = d.positions.filter(p => !byId.has(p.orgId))
      return { ...d, positions: [...kept, ...placed] }
    })

    for (const p of placed) queue.current[p.orgId] = p
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }, [flush])

  const cancelPeek = useCallback(() => {
    if (peekIn.current) clearTimeout(peekIn.current)
    if (peekOut.current) clearTimeout(peekOut.current)
    peekIn.current = null
    peekOut.current = null
    setPeek(null)
  }, [])

  useEffect(() => cancelPeek, [cancelPeek])

  const onNodeMouseEnter = useCallback((event: React.MouseEvent, rf: RFNode) => {
    if (rf.type === 'ring' || rf.type === 'ringLabel') return
    // Its card is already open; a peek on top of it says the same thing twice.
    if (rf.id === selected?.id) return
    const node = data?.nodes.find(n => n.id === rf.id)
    if (!node) return
    const at = { x: event.clientX, y: event.clientY }
    if (peekOut.current) { clearTimeout(peekOut.current); peekOut.current = null }
    if (peekIn.current) clearTimeout(peekIn.current)
    peekIn.current = setTimeout(() => setPeek({ node, ...at }), 200)
  }, [data, selected])

  const schedulePeekHide = useCallback(() => {
    if (peekIn.current) { clearTimeout(peekIn.current); peekIn.current = null }
    if (peekOut.current) clearTimeout(peekOut.current)
    peekOut.current = setTimeout(() => setPeek(null), 240)
  }, [])

  /**
   * Bring a note into focus: select it, which opens its card, and centre it.
   *
   * Centred off to the left so the card has room on the right, and a little
   * above the middle so the card hangs into the space below. `center: false`
   * moves the view only when the card would not fit on either side — a click
   * on something already in view should not throw the map around.
   */
  const focusNode = useCallback((id: string, opts: { center: boolean }) => {
    const node = data?.nodes.find(n => n.id === id)
    if (!node) return
    cancelPeek()
    setSelected(node)
    if (node.ring === PERIPHERY_RING) setShowPeriphery(true)
    const p = positions.get(id)
    if (!p) return
    const { x: tx, y: ty, zoom } = getViewport()
    if (!opts.center) {
      const dotX = p.x * zoom + tx
      const dotY = p.y * zoom + ty
      const fits = dotY > 0 && dotY < paneH && (
        dotX + CARD_GAP + CARD_W <= paneW - 8 || dotX - CARD_GAP - CARD_W >= 8)
      if (fits) return
    }
    const z = Math.max(zoom, 0.8)
    setCenter(p.x + (CARD_GAP + CARD_W / 2) / z, p.y + (paneH * 0.25) / z, { zoom: z, duration: 450 })
  }, [data, positions, getViewport, setCenter, paneW, paneH, cancelPeek])

  useEffect(() => { focusRef.current = focusNode }, [focusNode])

  const onNodeClick = useCallback((_: React.MouseEvent, node: RFNode) => {
    if (node.type === 'ring' || node.type === 'ringLabel') return
    focusNode(node.id, { center: false })
  }, [focusNode])

  /**
   * Write a link with its label into the source note, then show it here.
   *
   * Patched into local state rather than refetched: org-roam re-indexes on
   * save, but asynchronously, and a reload that beat it would drop the edge
   * you just drew.
   */
  const saveLink = useCallback(async (source: string, dest: string, label: string) => {
    const res = await fetch('/api/org/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source, dest, label, title: data?.nodes.find(n => n.id === dest)?.title ?? '',
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'failed')
    setData(d => {
      if (!d) return d
      const link = { source, dest, label: body.label as string | null }
      const at = d.links.findIndex(l => l.source === source && l.dest === dest)
      const links = at === -1 ? [...d.links, link] : d.links.map((l, i) => (i === at ? link : l))
      return { ...d, links }
    })
    setStatus(body.outcome === 'created' ? 'linked' : 'relabelled')
    setTimeout(() => setStatus(null), 1500)
  }, [data])

  /** Labels already in use, most used first — offered when drawing a new one. */
  const vocabulary = useMemo(() => {
    const count = new Map<string, number>()
    for (const l of data?.links ?? []) if (l.label) count.set(l.label, (count.get(l.label) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [data])

  // onConnect fires before onConnectEnd, and only the latter carries the
  // pointer — so the connection waits here for the place to show its prompt.
  const pendingLink = useRef<{ source: string; dest: string } | null>(null)
  const [linkPrompt, setLinkPrompt] = useState<{
    source: string; dest: string; x: number; y: number; initial: string
  } | null>(null)

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    pendingLink.current = { source: c.source, dest: c.target }
  }, [])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const p = pendingLink.current
    pendingLink.current = null
    if (!p) return
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event
    // Linking again to something already linked edits that link's label
    // rather than writing a second line for the same pair.
    const existing = data?.links.find(l => l.source === p.source && l.dest === p.dest)
    setLinkPrompt({ ...p, x: pt.clientX, y: pt.clientY, initial: existing?.label ?? '' })
  }, [data])

  const titles = useMemo(() => new Map((data?.nodes ?? []).map(n => [n.id, n.title])), [data])

  // Double-click opens the note's card and centres it: the gesture you want most often.
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: RFNode) => {
    if (node.type !== 'ring' && node.type !== 'ringLabel') focusNode(node.id, { center: true })
  }, [focusNode])

  useEffect(() => {
    if (!data || !focusId || centred.current) return
    const node = data.nodes.find(n => n.id === focusId)
    const p = positions.get(focusId)
    if (!node || !p) return
    centred.current = true
    setSelected(node)
    // A note arriving by link (?focus=) is in the periphery more often than not, and
    // centring on something the canvas is not drawing shows an empty screen.
    if (node.ring === PERIPHERY_RING) setShowPeriphery(true)
    setCenter(p.x, p.y, { zoom: 1, duration: 600 })
  }, [data, focusId, positions, setCenter])

  const release = useCallback(async (orgId: string) => {
    await fetch(`/api/org/positions?orgId=${encodeURIComponent(orgId)}`, { method: 'DELETE' })
    // Refetch rather than patch locally: dropping a pin changes what `layout`
    // computes, and recomputing from the server keeps one answer to where
    // things are.
    const res = await fetch('/api/org/graph')
    if (res.ok) setData(await res.json())
    setStatus('released to its ring')
    setTimeout(() => setStatus(null), 1500)
  }, [])

  /** Titles a note links to or from — what the peek shows instead of an id. */
  const neighboursOf = useCallback((id: string) => {
    if (!data) return []
    const title = new Map(data.nodes.map(n => [n.id, n.title]))
    const out: { title: string; dir: '→' | '←'; label: string | null }[] = []
    for (const l of data.links) {
      if (out.length >= 8) break
      if (l.source === id) out.push({ title: title.get(l.dest) ?? '?', dir: '→', label: l.label })
      else if (l.dest === id) out.push({ title: title.get(l.source) ?? '?', dir: '←', label: l.label })
    }
    return out
  }, [data])

  const drift = useMemo(
    () => (data ? drifted(data.nodes, positions, radii) : []),
    [data, positions, radii]
  )

  const pinnedCount = useMemo(
    () => [...positions.values()].filter(p => p.pinned).length,
    [positions]
  )

  const gaps = useMemo(
    () => (data ? unreachedGoals(data.nodes, data.links) : []),
    [data]
  )

  if (error) return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] p-8">
      <div className="max-w-md text-sm text-gray-600">
        <p className="font-semibold text-red-600 mb-2">Could not read org-roam</p>
        <p className="text-xs">{error}</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center h-[calc(100vh-56px)] text-gray-400 text-sm">
      Reading org-roam…
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <Sidebar>
        <div className="p-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Org-roam</div>
          <div className="text-xs text-gray-600 mt-0.5">
            {data.nodes.length} notes · {data.links.length} links
          </div>
        </div>

        <RoutinePanel />

        <TasksPanel onPeek={peekOrgLocation} />

        <CalendarPanel
          onPeekEntry={peekOrgLocation}
          onPeekDay={date => {
            const daily = data?.nodes.find(n => n.file === `daily/${date}.org`)
            if (daily) focusRef.current(daily.id, { center: true })
          }}
        />

        <div className="p-3 border-b border-gray-100">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400" />
        </div>

        <div className="px-3 py-2 border-b border-gray-100 space-y-1">
          {[0, 1, 2, 3, 4, 5].map(ring => {
            const style = ringStyle(ring)
            const count = data.nodes.filter(n => n.ring === ring).length
            return (
              <div key={ring} className="flex items-center gap-2 text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: style.dot }} />
                <span className="text-gray-600 flex-1">{style.label}</span>
                <span className="text-gray-400">{count}</span>
              </div>
            )
          })}
          <label className="flex items-center gap-1.5 cursor-pointer pt-1">
            <input type="checkbox" checked={showPeriphery}
              onChange={e => setShowPeriphery(e.target.checked)}
              className="accent-indigo-600 w-3 h-3" />
            <span className="text-[11px] text-gray-500">Draw the periphery</span>
          </label>
        </div>

        {drift.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Placed nearer than their horizon
            </div>
            <p className="text-[10px] text-gray-400 mb-1 leading-snug">
              You moved these inward; nothing written reaches them yet.
            </p>
            {drift.slice(0, 8).map(d => (
              <div key={d.node.id} className="flex items-center gap-1 group">
                <button onClick={() => setSelected(d.node)}
                  className="flex-1 min-w-0 text-left text-[11px] text-amber-700 truncate hover:underline">
                  {d.node.title}
                </button>
                <span className="text-[9px] text-gray-400 flex-shrink-0">
                  {ringStyle(d.placed).label} / {ringStyle(d.horizon).label}
                </span>
              </div>
            ))}
          </div>
        )}

        {gaps.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Goals nothing reaches
            </div>
            <p className="text-[10px] text-gray-400 mb-1 leading-snug">
              No path within 3 hops from today or this week.
            </p>
            {gaps.slice(0, 8).map(g => (
              <button key={g.id} onClick={() => setSelected(g)}
                className="block w-full text-left text-[11px] text-rose-600 hover:underline truncate">
                {g.title}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="text-xs font-semibold text-gray-900">{selected.title}</div>
            <div className="text-[10px] text-gray-400">
              {ringStyle(selected.ring).label} · {degree.get(selected.id) ?? 0} links
            </div>
            {selected.tags.length > 0 && (
              <div className="text-[10px] text-gray-500">{selected.tags.join(', ')}</div>
            )}
            {positions.get(selected.id)?.pinned && (
              <button onClick={() => release(selected.id)}
                className="w-full text-[11px] py-1 rounded border border-gray-200 text-gray-600 hover:border-gray-400">
                Release to its ring
              </button>
            )}
            <div className="text-[9px] text-gray-400 break-all">{selected.file}</div>
          </div>
        )}


        <WishlistPanel />

        <div className="mt-auto border-t border-gray-100">
          <ShortcutsButton />
        </div>

        <div className="p-2 border-t border-gray-100 text-[10px] text-gray-400 leading-snug">
          Drag to place — positions persist. Double-click opens the note.
          Drag a note&apos;s ○ knob to another to link them.
          {pinnedCount > 0 && <div className="mt-0.5">{pinnedCount} placed by hand</div>}
          {status && <div className="text-indigo-600 mt-1">{status}</div>}
        </div>
      </Sidebar>

      {peek && (
        <OrgPeek
          node={peek.node}
          x={peek.x}
          y={peek.y}
          ring={ringStyle(peek.node.ring)}
          degree={degree.get(peek.node.id) ?? 0}
          neighbours={neighboursOf(peek.node.id)}
          onMouseEnter={() => { if (peekOut.current) { clearTimeout(peekOut.current); peekOut.current = null } }}
          onMouseLeave={cancelPeek}
          onOpen={() => { setSelected(peek.node); cancelPeek() }}
        />
      )}

      {linkPrompt && (
        <LinkPrompt
          from={titles.get(linkPrompt.source) ?? '?'}
          to={titles.get(linkPrompt.dest) ?? '?'}
          x={linkPrompt.x}
          y={linkPrompt.y}
          vocabulary={vocabulary}
          initial={linkPrompt.initial}
          onCancel={() => setLinkPrompt(null)}
          onSave={async label => {
            await saveLink(linkPrompt.source, linkPrompt.dest, label)
            setLinkPrompt(null)
          }}
        />
      )}

      <div className="flex-1 relative">
        {selected && (
          <NoteCard
            node={selected}
            ringLabel={ringStyle(selected.ring).label}
            ringColor={ringStyle(selected.ring).dot}
            known={id => titles.has(id)}
            onFollow={id => focusNode(id, { center: true })}
            onClose={() => setSelected(null)}
            onSaved={reload}
            onEditingChange={onEditingChange}
            footer={(() => {
              const n = data.links.filter(l => l.source === selected.id || l.dest === selected.id).length
              if (n === 0) return null
              return (
                <details>
                  <summary className="px-3 py-1.5 text-[10px] text-gray-400 cursor-pointer select-none hover:text-gray-600">
                    {n} link{n === 1 ? '' : 's'} — labels
                  </summary>
                  <ConnectionsPanel
                    node={selected}
                    links={data.links}
                    titles={titles}
                    onSelect={id => focusNode(id, { center: true })}
                    onSave={(l, label) => saveLink(l.source, l.dest, label)}
                  />
                </details>
              )
            })()}
          />
        )}

        <RingSettingsPanel
          settings={ringSettings}
          radii={radii}
          counts={ringCounts}
          onChange={setRingSettings}
        />

        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-[min(520px,80%)]">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQuery(''); return }
              if (e.key !== 'Enter') return
              // Enter goes to the best match rather than merely filtering: the
              // point of searching a map is to be taken there.
              const hit = visibleNodes[0]
              if (!hit) return
              const p = positions.get(hit.id)
              if (!p) return
              setSelected(hit)
              setCenter(p.x, p.y, { zoom: 1, duration: 500 })
            }}
            placeholder="Search notes…  ⏎ to fly there"
            className="w-full text-sm px-3 py-2 rounded-full border border-gray-200 bg-white/95
                       shadow-sm focus:outline-none focus:border-indigo-400"
          />
          {query.trim() && (
            <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-sm
                            max-h-56 overflow-y-auto">
              {visibleNodes.slice(0, 10).map(n => (
                <button key={n.id}
                  onClick={() => {
                    const p = positions.get(n.id)
                    setSelected(n)
                    if (p) setCenter(p.x, p.y, { zoom: 1, duration: 500 })
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ringStyle(n.ring).dot }} />
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-700">{n.title}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {ringStyle(n.ring).label}
                  </span>
                </button>
              ))}
              {visibleNodes.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No note matches.</p>
              )}
            </div>
          )}
        </div>

        <HighlightContext.Provider value={highlight}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          // Generous, so a drop anywhere on the target note counts: the only
          // target handle is a pixel at the top of its dot.
          connectionRadius={40}
          connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '4 3' }}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={schedulePeekHide}
          onMoveStart={cancelPeek}
          // Not while editing: a stray click on the background would throw
          // away the edit with the card.
          onPaneClick={() => { if (!editingRef.current) setSelected(null) }}
          nodeTypes={orgNodeTypes}
          // No edge handlers here, and every edge otherwise carries an
          // invisible 20px-wide interaction path — thousands of them, matted
          // over the centre where the lines converge.
          edgesFocusable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.03}
          maxZoom={3}
          zoomOnDoubleClick={false}
          onlyRenderVisibleElements
          deleteKeyCode={null}
        >
          <Background color="#f3f4f6" gap={24} />
          <Controls />
        </ReactFlow>
        </HighlightContext.Provider>
      </div>
    </div>
  )
}

export default function OrgCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
