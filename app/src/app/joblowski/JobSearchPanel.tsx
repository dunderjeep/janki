'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ChainTree from '@/components/chains/ChainTree'
import { api, FlashBar, message, NextList, useNextActions } from '@/components/chains/NextList'
import type { DomainView } from '@/lib/chains/store'
import type { Application } from 'joblowski/types'

const NONE: never[] = []
const SHOWN = 3

/**
 * The job search front from Dough, inside Joblowski: its next actions (your own
 * steps from dough.org, plus jobs waiting in the tracker) and its chain.
 */
export default function JobSearchPanel({ applications }: { applications: Application[] }) {
  const [view, setView] = useState<DomainView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      setView(await api<DomainView>('/api/chains/money'))
      setError(null)
    } catch (err) {
      setError(message(err))
    }
  }, [])
  // Moving a job on in the tracker changes what is waiting here.
  useEffect(() => { void reload() }, [reload, applications])

  const front = view?.fronts.find((f) => f.signal === 'joblowski' && !f.parked && !f.done) ?? null
  const mine = useMemo(() => (front ? view!.next.filter((a) => a.frontId === front.id) : NONE), [view, front])
  const { items, flash, setFlash, error: actError, done, addStep, reorder, park, dismiss } = useNextActions(mine, reload)
  const nextIds = useMemo(() => new Set(items.filter((a) => !a.needsStep && a.id).map((a) => a.id!)), [items])
  const needsIds = useMemo(() => new Set(items.filter((a) => a.needsStep && !a.needsFirstStep && a.id).map((a) => a.id!)), [items])

  if (error && !view) {
    return <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-950">Job search next actions are unavailable: {error}</p>
  }
  if (!view || !front) return null

  return (
    <section className="mb-5 rounded-xl border border-sky-100 bg-sky-50/40 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-800">
          Next for the job search <span className="text-gray-400">({items.length})</span>
        </h2>
        <span className="flex gap-3 text-xs">
          <button className="text-sky-800 hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Less' : items.length > SHOWN ? `All ${items.length} and the chain` : 'Edit the chain'}
          </button>
          <Link href="/dough" className="text-sky-800 hover:underline">Dough →</Link>
        </span>
      </div>
      <FlashBar flash={flash} onClose={() => setFlash(null)} />
      {actError && <p className="mb-2 text-xs text-red-700">{actError}</p>}
      <NextList items={open ? items : items.slice(0, SHOWN)} showDomain={false} onDone={done} onAdd={addStep} onReorder={(keys) => reorder(open ? keys : [...keys, ...items.slice(SHOWN).map((a) => a.key)])} onPark={park} onDismiss={dismiss} />
      {open && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs text-gray-500">Your own steps for the job search, from ~/org/dough.org. Jobs waiting in the tracker are added above on their own.</p>
          <ChainTree domain="money" front={front} nextIds={nextIds} needsIds={needsIds} onChanged={reload} />
        </div>
      )}
    </section>
  )
}
