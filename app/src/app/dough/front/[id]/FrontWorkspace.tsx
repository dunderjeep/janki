'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ChainTree from '@/components/chains/ChainTree'
import { api, FlashBar, message, NextList, useNextActions } from '@/components/chains/NextList'
import type { DoughView } from '@/lib/dough/view'
import WorkspaceLink from '../../WorkspaceLink'
import FrontDocuments from './FrontDocuments'
import FrontLinks from './FrontLinks'
import FrontRecipes from './FrontRecipes'

const TABS = ['Workspace', 'Documents', 'Links', 'Recipes'] as const
type Tab = (typeof TABS)[number]

const NONE: never[] = []

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * One front with its workspace beside it: the to-dos on the left, the sheet
 * (or whatever the work happens in) on the right, so ticking a step off does
 * not mean leaving the work.
 */
export default function FrontWorkspace({ initial, frontId }: { initial: DoughView; frontId: string }) {
  const [view, setView] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [frameKey, setFrameKey] = useState(0)
  const [tab, setTab] = useState<Tab>('Workspace')
  // The hash keeps the tab across reloads; read after hydration so the server and client agree.
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1))
    if ((TABS as readonly string[]).includes(h)) setTab(h as Tab)
  }, [])
  const pick = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
  }
  const reload = useCallback(async () => {
    try {
      setView(await api<DoughView>('/api/dough'))
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }, [])

  const front = view.fronts.find((f) => f.id === frontId) ?? null
  const mine = useMemo(() => (front ? view.next.filter((a) => a.frontId === front.id) : NONE), [view, front])
  const { items, flash, setFlash, error: actError, done, addStep, reorder } = useNextActions(mine, reload)
  const nextIds = useMemo(() => new Set(items.filter((a) => !a.needsStep && a.id).map((a) => a.id!)), [items])
  const needsIds = useMemo(() => new Set(items.filter((a) => a.needsStep && !a.needsFirstStep && a.id).map((a) => a.id!)), [items])

  if (!front) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-gray-600">
        That front is no longer in dough.org. <Link className="text-sky-800 hover:underline" href="/dough">Back to Dough</Link>
      </div>
    )
  }
  const signal = view.signals.fronts[front.id]

  return (
    <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3">
        <Link href="/dough" className="text-sm text-sky-800 hover:underline">← Dough</Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 break-words">{front.title}</h1>
          {front.purpose && <p className="text-xs text-gray-600 break-words">Why: {front.purpose}</p>}
          {signal?.line && <p className="mt-1 text-sm text-gray-700">{signal.line}</p>}
        </div>
        {(error || actError) && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{error ?? actError}</p>}
        <FlashBar flash={flash} onClose={() => setFlash(null)} />
        <section>
          <h2 className="mb-1.5 text-sm font-medium text-gray-700">Can do now</h2>
          <NextList items={items} showDomain={false} onDone={done} onAdd={addStep} onReorder={reorder} />
        </section>
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="mb-1.5 text-sm font-medium text-gray-700">The chain</h2>
          <ChainTree domain="money" front={front} nextIds={nextIds} needsIds={needsIds} onChanged={reload}
                    index={view.index} fronts={view.fronts} domainTitles={{ life: 'Life', money: 'Money' }} />
        </section>
      </aside>

      <section className="min-w-0">
        <nav className="mb-3 flex gap-1 border-b border-gray-200 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => pick(t)}
              className={`-mb-px border-b-2 px-3 py-1.5 ${tab === t ? 'border-sky-700 font-medium text-sky-800' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === 'Documents' && <FrontDocuments frontId={front.id} />}
        {tab === 'Links' && <FrontLinks frontId={front.id} signal={front.signal} />}
        {tab === 'Recipes' && <FrontRecipes frontId={front.id} />}
        {tab !== 'Workspace' ? null : front.workspace ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-gray-500">{hostOf(front.workspace)}</span>
              <span className="flex flex-wrap items-center gap-3">
                <button className="text-sky-800 hover:underline" onClick={() => setFrameKey((k) => k + 1)}>Reload</button>
                <a className="text-sky-800 hover:underline" href={front.workspace} target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a>
                <WorkspaceLink frontId={front.id} current={front.workspace} onChanged={reload} label="Change link" />
              </span>
            </div>
            <iframe
              key={`${frameKey}-${front.workspace}`}
              title={`${front.title} workspace`}
              src={front.workspace}
              className="h-[80vh] w-full rounded-lg border border-gray-200 bg-white lg:h-[calc(100vh-9rem)]"
              allow="clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="no-referrer"
            />
            <p className="mt-1 text-xs text-gray-500">
              Shown with your own Google sign-in in this browser. If the frame stays blank, the site does not allow embedding: use Open in a new tab.
            </p>
          </>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600">
            <p>Add the link to where this front&apos;s work happens, such as its Google Sheet.</p>
            <WorkspaceLink frontId={front.id} current={null} onChanged={reload} label="+ Workspace link" />
          </div>
        )}
      </section>
    </div>
  )
}
