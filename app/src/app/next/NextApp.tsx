'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import ChainTree from '@/components/chains/ChainTree'
import { ProjectDocs } from '@/components/chains/docs'
import { ActionLinks, api, chainOp, FlashBar, message, NextList, PopCard, useNextActions } from '@/components/chains/NextList'
import { LinkChips } from '@/components/chains/links'
import { StepBar } from '@/components/chains/StepBar'
import {
  applyFilter, CalendarPlanner, CaptureBox, DEFAULT_CONTEXTS, FilterBar, InboxTab, NO_FILTER, placesIn, ReviewTab, SomedayTab, TaskTools,
  TrashList, useInbox, ProjectsPanel, projectsOf, EditableTitle, NextSearch,
  type Filter,
} from '@/components/chains/gtd'
import type { OverallView } from '@/lib/chains/store'
import { BLANK_NODE, type ChainNode, type NextAction } from '@/lib/chains/tree'
import NewDailyButton from '@/components/org/NewDailyButton'

/** A whole domain's outline as one tree, so tasks can move in and out of projects. */
const rootOf = (key: string, fronts: ChainNode[]): ChainNode => ({ ...BLANK_NODE, id: `root:${key}`, title: '', children: fronts })

type Tab = 'do' | 'inbox' | 'review' | 'someday' | 'outline'

/**
 * Getting things done: capture into the inbox, process it to zero, then do:
 * the two-minute jobs first, then whatever fits where you are, the time you
 * have and your energy. The weekly review keeps it honest.
 */
export default function NextApp({ initial }: { initial: OverallView }) {
  const [view, setView] = useState(initial)
  const inbox = useInbox()
  const reload = useCallback(async () => setView(await api<OverallView>('/api/chains')), [])
  const reloadInbox = inbox.reload
  const reloadAll = useCallback(async () => { await Promise.all([reload(), reloadInbox()]) }, [reload, reloadInbox])
  const { items, flash, setFlash, error, done, addStep, reorder, later, park, dismiss } = useNextActions(view.next, reload)
  const [page, setPage] = useState<Tab>('do')
  const [filter, setFilter] = useState<Filter>(NO_FILTER)
  const nowItems = useMemo(() => items.filter((a) => a.now && !a.needsStep), [items])
  const [projectId, setProjectId] = useState<string | null>(null)
  const projects = useMemo(() => projectsOf(view.outline), [view.outline])
  const project = projects.find((p) => p.front.id === projectId) ?? null
  const shownItems = useMemo(
    () => applyFilter(items.filter((a) => !a.now && (!projectId || a.frontId === projectId)), filter),
    [items, filter, projectId],
  )
  const top = shownItems[0]
  const knownContexts = useMemo(() => [...new Set([...DEFAULT_CONTEXTS, ...items.flatMap((a) => a.contexts)])], [items])
  const places = useMemo(() => placesIn(view.outline), [view.outline])
  const stuck = useMemo(() => items.filter((a) => a.needsStep), [items])
  const inboxCount = inbox.view?.items.length ?? 0
  const tools = useCallback((a: NextAction) => (
    <TaskTools a={a} knownContexts={knownContexts} onChanged={reload}
      onFlash={(text, undo) => setFlash({ text, undo: undo && (async () => { await undo(); setFlash(null) }) })} />
  ), [knownContexts, reload, setFlash])

  const domainTitlesAll = useMemo(() => Object.fromEntries(view.outline.map((o) => [o.domain.key, o.domain.title])), [view.outline])
  const steps = useCallback((a: NextAction, rename: () => void) => (
    <StepBar a={a} index={view.index} fronts={view.outline.find((o) => o.domain.key === a.domain)?.fronts}
      domainTitles={domainTitlesAll} onRename={rename} onChanged={reload} onFlash={(text) => setFlash({ text })} />
  ), [view.index, view.outline, domainTitlesAll, reload, setFlash])

  const [tab, setTab] = useState(view.outline[0]?.domain.key ?? 'life')
  const [focusId, setFocusId] = useState<string | null>(null)
  const domainTitles = useMemo(() => Object.fromEntries(view.outline.map((o) => [o.domain.key, o.domain.title])), [view.outline])
  const nextIds = useMemo(() => new Set(items.filter((a) => !a.needsStep && a.id).map((a) => a.id!)), [items])
  const needsIds = useMemo(() => new Set(items.filter((a) => a.needsStep && !a.needsFirstStep && a.id).map((a) => a.id!)), [items])

  /** Shows a heading in the outline below: its domain's tab, selected, scrolled to. */
  const locate = useCallback((id: string) => {
    const it = view.index[id]
    if (!it) return
    setTab(it.domain)
    setPage('outline')
    setFocusId(null)
    setTimeout(() => setFocusId(id), 0)
  }, [view.index])
  const locateAction = useCallback((a: NextAction) => a.id && locate(a.id), [locate])

  const shown = view.outline.find((o) => o.domain.key === tab) ?? view.outline[0]

  return (
    <div className={`mx-auto px-4 py-6 ${page === 'do' ? 'max-w-7xl' : 'max-w-2xl'}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Next</h1>
        <div className="flex items-baseline gap-4">
          <NewDailyButton />
          <Link href="/next/capture" className="text-sm text-sky-800 hover:underline" title="A capture page for your phone">Phone capture</Link>
          <Link href="/dough" className="text-sm text-sky-800 hover:underline">Money fronts →</Link>
        </div>
      </div>

      {page !== 'inbox' && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
          <CaptureBox onCaptured={(t) => { void reloadInbox(); setFlash({ text: `In the inbox: ${t}` }) }} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-200">
      <nav className="flex flex-wrap gap-1 text-sm">
        {([['do', 'Do'], ['inbox', `Inbox${inboxCount ? ` (${inboxCount})` : ''}`], ['review', 'Weekly review'], ['someday', 'Someday'], ['outline', 'Outline']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => { setPage(k); setFlash(null) }}
            className={`-mb-px border-b-2 px-3 py-1.5 ${page === k ? 'border-sky-700 font-medium text-sky-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </nav>
        <div className="mb-1.5 w-full sm:w-auto">
          <NextSearch onOpen={(h) => {
            if (h.place === 'inbox') { setPage('inbox'); return }
            if (h.chainId && view.index[h.chainId]) { locate(h.chainId); return }
            setFlash({ text: `${h.title}: in ${h.placeTitle}${h.done ? ' (done)' : ''}` })
          }} />
        </div>
      </div>

      {view.problems.map((p) => (
        <p key={p.source} className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-950">
          {p.source} could not be read: {p.error}
        </p>
      ))}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      <FlashBar flash={flash} onClose={() => setFlash(null)} />

      {page === 'inbox' && <InboxTab inbox={inbox} places={places} knownContexts={knownContexts} onChanged={reload} />}
      {page === 'review' && <ReviewTab stuck={stuck} inboxCount={inboxCount} goInbox={() => setPage('inbox')} onChanged={reloadAll} />}
      {page === 'someday' && <SomedayTab onChanged={reload} />}

      {page === 'do' && (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[250px_minmax(0,1fr)_320px]">
      <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <ProjectsPanel projects={projects} items={items} selected={projectId} onSelect={setProjectId} onChanged={reload}
          onFlash={(text, undo) => setFlash({ text, undo: undo && (async () => { await undo(); setFlash(null) }) })} />
      </aside>
      <div className="min-w-0">
      {project && (
        <section className="mb-4 rounded-xl border border-sky-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-sky-800">{project.domainTitle} project</p>
              <h2 className="text-lg font-semibold text-gray-900 break-words">
                <EditableTitle place={project.domain} id={project.front.id} title={project.front.title} onSaved={reload} />
              </h2>
              {project.front.purpose && <p className="text-sm text-gray-600 break-words">Why: {project.front.purpose}</p>}
            </div>
            <span className="flex shrink-0 gap-3 text-xs">
              {project.domain === 'money' && <Link href={`/dough/front/${project.front.id}`} className="text-sky-800 hover:underline">Open in Dough</Link>}
              <button className="text-gray-500 hover:text-gray-800" onClick={() => setProjectId(null)}>× all projects</button>
            </span>
          </div>
          <div className="mt-2">
            <ChainTree domain={project.domain} front={project.front} nextIds={nextIds} needsIds={needsIds} onChanged={reload}
              index={view.index} fronts={view.outline.find((o) => o.domain.key === project.domain)?.fronts ?? []} domainTitles={domainTitles} />
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <ProjectDocs key={project.front.id} place={project.domain} project={project.front.id} />
          </div>
        </section>
      )}
      {nowItems.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <h2 className="mb-2 text-sm font-medium text-amber-950">Now: two-minute jobs <span className="font-normal text-amber-800">({nowItems.length}) just do them</span></h2>
          <ul className="space-y-1">
            {nowItems.map((a) => (
              <li key={a.key} className="flex items-start gap-2 rounded-lg bg-white px-2 py-1.5">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-amber-600" aria-label={`Done: ${a.title}`} onChange={() => done(a)} />
                <span className="min-w-0 flex-1 text-sm text-gray-900 break-words">
                  {a.id ? <EditableTitle place={a.domain} id={a.id} title={a.title} onSaved={reload} /> : a.title}
                </span>
                <button className="shrink-0 text-xs text-gray-500 hover:text-gray-800" title="It takes longer than two minutes"
                  onClick={async () => { await chainOp(a.domain, { op: 'set', id: a.id, field: 'now', value: 'nil' }); await reload() }}>longer</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar items={items} filter={filter} onChange={setFilter} />

      <PopCard
        a={top}
        showDomain
        onDone={() => top && done(top)}
        onLater={() => top && later(top)}
        onAdd={(t) => (top ? addStep(top, t) : Promise.resolve())}
        onRenamed={reload}
        steps={steps}
        onSnooze={async (when) => {
          if (!top?.id) return
          await api('/api/gtd/snooze', 'POST', { place: top.domain, id: top.id, until: when })
          setFlash({
            text: `Not now: ${top.title}, back ${when.length > 10 ? `${when.slice(0, 10)} at ${when.slice(11)}` : when}`,
            undo: async () => { await api('/api/gtd/snooze', 'POST', { place: top.domain, id: top.id, until: null }); setFlash(null); await reload() },
          })
          await reload()
        }}
      />

      <h2 className="mb-2 text-sm font-medium text-gray-700">
        Can do now <span className="text-gray-400">({shownItems.length}{shownItems.length !== items.length - nowItems.length ? ` of ${items.length - nowItems.length}` : ''})</span>
        <span className="ml-2 font-normal text-gray-400">click a task to rename, break down, link or move it · drag to put first things first</span>
      </h2>
      <NextList items={shownItems} showDomain onDone={done} onAdd={addStep} onReorder={reorder} onPark={park} onDismiss={dismiss}
        index={view.index} onLocate={locateAction} tools={tools} steps={steps} onRenamed={reload} />

      {view.waiting.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-gray-700">
            Waiting <span className="text-gray-400">({view.waiting.length})</span>
            <span className="ml-2 font-normal text-gray-400">comes back once what it waits for is done</span>
          </h2>
          <ul className="space-y-1.5">
            {view.waiting.map(({ action: a, on, who }) => (
              <li key={a.key} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-sm text-gray-700 break-words">{a.title}</p>
                <p className="text-xs text-gray-500">{[a.domainTitle, ...a.path].join(' › ')}{who ? ` · waiting for ${who}` : ''}</p>
                <LinkChips links={[]} waits={on} index={view.index} onJump={locate} />
                {who && a.id && (
                  <button className="mt-0.5 text-xs text-sky-800 hover:underline" onClick={async () => {
                    await chainOp(a.domain, { op: 'set', id: a.id, field: 'todo', value: 'TODO' })
                    await chainOp(a.domain, { op: 'set', id: a.id, field: 'WAITING_ON', value: '' })
                    await reload()
                  }}>It came: back to my list</button>
                )}
                <ActionLinks a={a} onLocate={locateAction} />
              </li>
            ))}
          </ul>
        </section>
      )}

      </div>
      <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
        <div className="xl:hidden">
          <ProjectsPanel projects={projects} items={items} selected={projectId} onSelect={setProjectId} onChanged={reload}
            onFlash={(text, undo) => setFlash({ text, undo: undo && (async () => { await undo(); setFlash(null) }) })} />
        </div>
        <CalendarPlanner upcoming={view.upcoming} onChanged={reload} onFlash={(text) => setFlash({ text })} />
      </aside>
      </div>
      )}

      {page === 'outline' && (<>
      <QuickAdd view={view} onAdded={async (where) => { await reload(); setFlash({ text: `Added to ${where}.` }) }} />
      <section className="mt-2" id="outline">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-700">Outline</h2>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
            {view.outline.map((o) => (
              <button key={o.domain.key} onClick={() => setTab(o.domain.key)}
                className={`rounded px-2.5 py-0.5 ${tab === o.domain.key ? 'bg-sky-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {o.domain.title}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Tap a line for its actions. <b>Break down</b> adds a step under it and makes it a project; drag a line into or out of a
          project, or use <b>Move to…</b>; <b>Link…</b> ties it to anything else, or makes it wait for it.
        </p>
        {shown && (
          <ChainTree
            key={shown.domain.key}
            domain={shown.domain.key}
            front={rootOf(shown.domain.key, shown.fronts)}
            wholeFile
            fronts={shown.fronts}
            nextIds={nextIds}
            needsIds={needsIds}
            index={view.index}
            domainTitles={domainTitles}
            focusId={focusId}
            onJump={locate}
            onChanged={reload}
          />
        )}
      </section>

      <TrashList onChanged={reload} />
      </>)}

      <p className="mt-6 text-xs text-gray-500">
        Life is the note tasks.org, money is dough.org and the inbox is inbox.org; other loose TODOs come from your agenda notes.
        They are ordinary notes, so Quilt and search see the same tasks.
      </p>
    </div>
  )
}

/** Type a task; it goes to Life on its own, or into any project or front you pick. */
function QuickAdd({ view, onAdded }: { view: OverallView; onAdded: (where: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [target, setTarget] = useState('life:')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Where it can go: the top of each domain, then every open heading with something under it, or a front.
  const targets = useMemo(() => {
    const out: { value: string; label: string }[] = []
    for (const { domain, fronts } of view.outline) {
      out.push({ value: `${domain.key}:`, label: domain.key === 'life' ? 'Life (on its own)' : `${domain.title} (a new front)` })
      const walk = (n: ChainNode, depth: number, path: string[]) => {
        if (n.done || n.parked) return
        if (depth === 0 || n.children.length) out.push({ value: `${domain.key}:${n.id}`, label: `${domain.title} › ${[...path, n.title].join(' › ')}` })
        n.children.forEach((c) => walk(c, depth + 1, [...path, n.title]))
      }
      fronts.forEach((f) => walk(f, 0, []))
    }
    return out
  }, [view.outline])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    const [domain, anchor] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1) || null]
    try {
      await chainOp(domain, { op: 'add', anchor, place: 'last', title: text.trim() })
      setText('')
      await onAdded(targets.find((t) => t.value === target)?.label ?? domain)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={add} className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <button disabled={busy} className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        into
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700">
          {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </form>
  )
}
