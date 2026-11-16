'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { OPEN_STATUSES, type Application, type CustomBoard, type DocSummary, type NewHit, type SavedSearch } from '../lib/types'
import BoardsTab from './BoardsTab'
import FactsTab from './FactsTab'
import MapTab from './MapTab'
import DocsTab from './DocsTab'
import SearchTab from './SearchTab'
import TrackerTab from './TrackerTab'
import { api } from './ui'

const TABS = [
  { key: 'search', label: 'Search' },
  { key: 'tracker', label: 'Tracker' },
  { key: 'resumes', label: 'Résumés' },
  { key: 'letters', label: 'Cover letters' },
  { key: 'map', label: 'Map' },
  { key: 'facts', label: 'Facts' },
  { key: 'boards', label: 'Job boards' },
] as const
type Tab = (typeof TABS)[number]['key']

export default function JoblowskiApp({ initialTab, initialApplications, initialDocuments, initialSaved, initialHits, initialBoards, panel, title = 'Joblowski' }: {
  initialTab?: string
  initialApplications: Application[]
  initialDocuments: DocSummary[]
  initialSaved: SavedSearch[]
  initialHits: NewHit[]
  initialBoards: CustomBoard[]
  /** Something the host shows above the tabs, given the current applications (janki shows its job search front). */
  panel?: (applications: Application[]) => ReactNode
  title?: string
}) {
  const [tab, setTabState] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : 'search')
  const [applications, setApplications] = useState(initialApplications)
  const [documents, setDocuments] = useState(initialDocuments)
  const [hits, setHits] = useState(initialHits)
  const [boards, setBoards] = useState(initialBoards)

  // Links from Dough and Next arrive as ?tab=tracker&job=<id>, often without a page load.
  const params = useSearchParams()
  const [openJob, setOpenJob] = useState<string | null>(params.get('job'))
  useEffect(() => {
    const t = params.get('tab')
    if (t && TABS.some((x) => x.key === t)) setTabState(t as Tab)
    setOpenJob(params.get('job'))
  }, [params])

  const setTab = (next: Tab) => {
    setTabState(next)
    window.history.replaceState(null, '', `/joblowski?tab=${next}`)
  }

  const reloadApplications = useCallback(async () => {
    const body = await api<{ applications: Application[] }>('/api/joblowski/applications')
    setApplications(body.applications)
  }, [])

  const reloadDocuments = useCallback(async () => {
    const body = await api<{ documents: DocSummary[] }>('/api/joblowski/documents')
    setDocuments(body.documents)
  }, [])

  const tracked = applications.filter((a) => OPEN_STATUSES.includes(a.status)).length

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">{tracked} active {tracked === 1 ? 'application' : 'applications'}</p>
      </div>
      {panel?.(applications)}
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-sky-700 text-sky-800' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
            {t.key === 'search' && hits.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{hits.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <SearchTab initialSaved={initialSaved} boards={boards} hits={hits} setHits={setHits} onTracked={reloadApplications} />
      )}
      {tab === 'tracker' && (
        <TrackerTab applications={applications} documents={documents} reload={reloadApplications} openJob={openJob} />
      )}
      {tab === 'resumes' && <DocsTab kind="resume" documents={documents} reload={reloadDocuments} />}
      {tab === 'letters' && <DocsTab kind="letter" documents={documents} reload={reloadDocuments} />}
      {tab === 'map' && <MapTab applications={applications} reload={reloadApplications} />}
      {tab === 'facts' && <FactsTab />}
      {tab === 'boards' && <BoardsTab boards={boards} setBoards={setBoards} />}
    </div>
  )
}
