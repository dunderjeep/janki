'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import JobControls from './JobControls'
import {
  OPEN_STATUSES,
  STATUSES,
  STATUS_LABEL,
  isHttpUrl,
  sourceLabel,
  type Application,
  type DocKind,
  type DocSummary,
  type PinnedDoc,
  type Status,
} from '../lib/types'
import { api, daysUntil, inputClass, localToday, message, primaryClass, secondaryClass, shortDate, STATUS_PILL } from './ui'

type Sort = 'due' | 'applied' | 'added' | 'category'

/** Offered in the category box; anything else typed is kept too. */
const CATEGORIES = ['Software / IT', 'Kitchen']

function DueCell({ app }: { app: Application }) {
  if (!app.dueDate) return <span className="text-gray-400">—</span>
  const days = daysUntil(app.dueDate)
  const urgent = app.status === 'saved'
  const tone = urgent && days < 0 ? 'text-red-700 font-medium' : urgent && days <= 3 ? 'text-amber-700 font-medium' : 'text-gray-700'
  return (
    <span className={tone}>
      {shortDate(app.dueDate)}
      {urgent && days < 0 && ' · passed'}
      {urgent && days >= 0 && days <= 3 && ` · ${days === 0 ? 'today' : `${days}d`}`}
    </span>
  )
}

type Form = {
  company: string
  role: string
  url: string
  location: string
  category: string
  address: string
  status: Status
  parkedUntil: string
  dateApplied: string
  dueDate: string
  notes: string
  posting: string
}

const emptyForm: Form = { company: '', role: '', url: '', location: '', category: '', address: '', status: 'saved', parkedUntil: '', dateApplied: '', dueDate: '', notes: '', posting: '' }

function DocPicker({ label, kind, pin, documents, disabled, onTailor, choice, setChoice }: {
  label: string
  kind: DocKind
  pin: PinnedDoc | null
  documents: DocSummary[]
  disabled: boolean
  onTailor: (documentId: string) => void
  choice: string
  setChoice: (id: string) => void
}) {
  const options = documents.filter((d) => d.kind === kind)
  const stillPinned = pin !== null && choice === pin.documentId
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <select className={inputClass} value={choice} disabled={disabled} onChange={(e) => setChoice(e.target.value)}>
          <option value="">None</option>
          {pin && !options.some((d) => d.id === pin.documentId) && <option value={pin.documentId}>{pin.name}</option>}
          {options.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {choice && (
          <button type="button" className={`${secondaryClass} shrink-0`} disabled={disabled} title="Make a copy just for this job, with {{company}}, {{role}} and {{date}} filled in" onClick={() => onTailor(choice)}>
            Copy
          </button>
        )}
      </div>
      {stillPinned && pin && (
        <p className="mt-1 text-xs text-gray-500">
          Copy kept from {shortDate(pin.pinnedAt)}: <a className="text-sky-800 underline" href={`/api/joblowski/revisions/${pin.revisionId}/pdf`}>PDF</a>
          {pin.changedSince && ' · the document has changed since. Moving this job to Applied takes a fresh copy.'}
        </p>
      )}
    </div>
  )
}

function Drawer({ app, documents, categories, onClose, onSaved }: {
  app: Application | null
  categories: string[]
  documents: DocSummary[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(
    app
      ? {
          company: app.company,
          role: app.role,
          url: app.url ?? '',
          location: app.location ?? '',
          category: app.category ?? '',
          address: app.address ?? '',
          status: app.status,
          parkedUntil: app.parkedUntil ?? '',
          dateApplied: app.dateApplied ?? '',
          dueDate: app.dueDate ?? '',
          notes: app.notes,
          posting: app.posting,
        }
      : emptyForm,
  )
  const [resumeId, setResumeId] = useState(app?.resume?.documentId ?? '')
  const [letterId, setLetterId] = useState(app?.letter?.documentId ?? '')
  const [guidance, setGuidance] = useState('')
  const [drafting, setDrafting] = useState<DocKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteDate, setNoteDate] = useState(localToday)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const urlBad = form.url.trim() !== '' && !isHttpUrl(form.url.trim())

  const persist = async (overrides: Partial<Form> = {}): Promise<void> => {
    const body = { ...form, ...overrides }
    if (app) {
      const payload: Record<string, unknown> = { ...body }
      // Only a changed choice is sent, so saving never replaces the kept copy.
      if (resumeId !== (app.resume?.documentId ?? '')) payload.resumeDocumentId = resumeId || null
      if (letterId !== (app.letter?.documentId ?? '')) payload.letterDocumentId = letterId || null
      await api(`/api/joblowski/applications/${app.id}`, 'PATCH', payload)
    } else {
      const created = await api<{ id: string; existed: boolean }>('/api/joblowski/applications', 'POST', body)
      if (created.existed) throw new Error('You are already tracking a job with that link')
    }
  }

  const finish = async (run: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      await onSaved()
      onClose()
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  const save = () => finish(persist)
  /** Kept for later, or until a day: no due-date nag and no to-do in Dough until it is back. */
  const park = (until: string | null) => finish(() => persist({ status: 'parked', parkedUntil: until ?? '' }))

  const logNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!app || !note.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/joblowski/applications/${app.id}/log`, 'POST', { note, at: noteDate })
      setNote('')
      await onSaved()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const removeNote = async (eventId: string) => {
    if (!app) return
    setError(null)
    try {
      await api(`/api/joblowski/applications/${app.id}/log`, 'DELETE', { eventId })
      await onSaved()
    } catch (err) {
      setError(message(err))
    }
  }
  const unpark = () =>
    finish(async () => {
      if (!app) return
      await persist({ status: 'parked' })
      await api(`/api/joblowski/applications/${app.id}`, 'PATCH', { unpark: true })
    })

  const remove = async () => {
    if (!app || !window.confirm(`Delete ${app.role} at ${app.company} from the tracker?`)) return
    setBusy(true)
    try {
      await api(`/api/joblowski/applications/${app.id}`, 'DELETE')
      await onSaved()
      onClose()
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  const tailor = async (documentId: string) => {
    if (!app) return
    setBusy(true)
    setError(null)
    try {
      await persist()
      const { id } = await api<{ id: string }>(`/api/joblowski/applications/${app.id}/tailor`, 'POST', { documentId })
      router.push(`/joblowski/docs/${id}`)
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  const draft = async (kind: DocKind) => {
    if (!app) return
    setBusy(true)
    setDrafting(kind)
    setError(null)
    try {
      await persist()
      const { id } = await api<{ id: string }>(`/api/joblowski/applications/${app.id}/draft`, 'POST', {
        documentId: kind === 'resume' ? resumeId : letterId || null,
        kind,
        guidance,
      })
      router.push(`/joblowski/docs/${id}`)
    } catch (err) {
      setError(message(err))
      setBusy(false)
      setDrafting(null)
    }
  }

  const field = (label: string, key: 'company' | 'role' | 'location', required = false) => (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}{required && ' *'}</span>
      <input className={inputClass} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={app ? 'Edit job' : 'Add job'} className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{app ? 'Job details' : 'Add a job'}</h2>
          <button className="text-gray-500 hover:text-gray-900 text-xl leading-none" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="space-y-3">
          {field('Company', 'company', true)}
          {field('Role', 'role', true)}
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Link to job</span>
            <span className="flex gap-2">
              <input className={`${inputClass} min-w-0 flex-1`} value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
              {/^https?:\/\/\S+$/i.test(form.url.trim()) && (
                <a
                  href={form.url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-sky-800 hover:bg-sky-50"
                  title="Open the ad in a new tab"
                >
                  Open ↗
                </a>
              )}
            </span>
            {urlBad && <span className="mt-1 block text-xs text-red-700">This must start with http:// or https://</span>}
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Category</span>
            <input className={inputClass} list="joblowski-categories" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Software / IT, Kitchen, …" />
            <datalist id="joblowski-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          {field('Location', 'location')}
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Street address, for the map</span>
            <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="e.g. Gøteborggata 1, Oslo" />
            {app?.address && app.lat === null && form.address === app.address && (
              <span className="mt-1 block text-xs text-amber-800">OpenStreetMap could not find this address, so it is not on the map. Try the street and number, then the city.</span>
            )}
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Status</span>
            <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value as Status)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          {form.status === 'parked' && (
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Comes back on (empty parks it until you say)</span>
              <input type="date" className={inputClass} value={form.parkedUntil} onChange={(e) => set('parkedUntil', e.target.value)} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Date applied</span>
              <input type="date" className={inputClass} value={form.dateApplied} onChange={(e) => set('dateApplied', e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Due date</span>
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </label>
          </div>
          {app ? (
            <>
              <DocPicker label="Résumé" kind="resume" pin={app.resume} documents={documents} disabled={busy} onTailor={tailor} choice={resumeId} setChoice={setResumeId} />
              <DocPicker label="Cover letter" kind="letter" pin={app.letter} documents={documents} disabled={busy} onTailor={tailor} choice={letterId} setChoice={setLetterId} />
              <div className="rounded-lg bg-sky-50 p-3 space-y-2">
                <p className="text-sm font-medium text-gray-900">Draft with Claude</p>
                <label className="block">
                  <span className="sr-only">Job posting text</span>
                  <textarea className={inputClass} rows={4} value={form.posting} onChange={(e) => set('posting', e.target.value)} placeholder="Paste the job posting, or leave this empty to read the link above" />
                </label>
                <label className="block">
                  <span className="sr-only">Guidance for Claude</span>
                  <input className={inputClass} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="Anything to emphasise (optional)" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryClass} disabled={busy || !resumeId} onClick={() => draft('resume')}>
                    {drafting === 'resume' ? 'Drafting…' : 'Draft résumé'}
                  </button>
                  <button type="button" className={secondaryClass} disabled={busy || !resumeId} onClick={() => draft('letter')}>
                    {drafting === 'letter' ? 'Drafting…' : 'Draft letter'}
                  </button>
                </div>
                <p className="text-xs text-gray-600">
                  {!resumeId ? 'Choose a résumé above to start from. ' : !letterId ? 'With no cover letter chosen, Claude writes one from your résumé. ' : ''}
                  Makes a new copy using only facts already in your résumé. This takes under a minute.
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Once it is saved, you can attach a résumé and cover letter.</p>
          )}
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Notes</span>
            <textarea className={inputClass} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          {app && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">History</p>
              {app.history.length > 0 && (
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {app.history.map((h) => (
                    <li key={h.id}>
                      {shortDate(h.at)}: {h.status ? STATUS_LABEL[h.status] : h.note}
                      {h.status === null && (
                        <button type="button" className="ml-2 text-gray-400 hover:text-red-700" title="Remove this note" aria-label="Remove this note" onClick={() => removeNote(h.id)}>×</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form className="mt-2 flex flex-wrap gap-2" onSubmit={logNote}>
                <input className={`${inputClass} min-w-[10rem] flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log what happened: took the test, second interview…" />
                <input type="date" className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} aria-label="When" />
                <button className={secondaryClass} disabled={busy || !note.trim()}>Log</button>
              </form>
              {app.source && <p className="mt-1 text-xs text-gray-500">Found via {sourceLabel(app.source)}</p>}
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button className={primaryClass} disabled={busy || urlBad || !form.company.trim() || !form.role.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              {app?.status === 'parked' && (
                <>
                  <button className={secondaryClass} disabled={busy} onClick={unpark}>Unpark</button>
                  {app.parkedUntil && <span className="text-xs text-gray-500">back on {shortDate(app.parkedUntil)}</span>}
                </>
              )}
              {app && OPEN_STATUSES.includes(app.status) && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><JobControls onPark={park} /></span>
              )}
            </div>
            {app && <button className="text-sm text-gray-500 hover:text-red-700" disabled={busy} onClick={remove}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TrackerTab({ applications, documents, reload, openJob = null }: {
  applications: Application[]
  documents: DocSummary[]
  reload: () => Promise<void>
  /** A job to open on arrival, from a link in Dough or Next. */
  openJob?: string | null
}) {
  const [filter, setFilter] = useState<Status | 'open' | 'all'>('open')
  const [sort, setSort] = useState<Sort>('due')
  const [category, setCategory] = useState<string>('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const opened = useRef<string | null>(null)

  useEffect(() => {
    if (!openJob || opened.current === openJob) return
    const app = applications.find((a) => a.id === openJob)
    if (!app) return
    opened.current = openJob
    setEditing(app)
  }, [openJob, applications])

  const counts = useMemo(() => {
    const map = new Map<Status, number>()
    for (const a of applications) map.set(a.status, (map.get(a.status) ?? 0) + 1)
    return map
  }, [applications])

  // The two suggested, then any others in use, so a new one typed once is offered next time.
  const categories = useMemo(
    () => [...new Set([...CATEGORIES, ...applications.map((a) => a.category).filter((c): c is string => Boolean(c))])],
    [applications],
  )

  const shown = useMemo(() => {
    // Every word must appear somewhere in the job: "kokk oslo" finds Oslo cooks.
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const kept = applications.filter((a) => {
      if (filter === 'open' ? !OPEN_STATUSES.includes(a.status) : filter !== 'all' && a.status !== filter) return false
      if (category === '-' ? a.category : category && a.category !== category) return false
      if (!words.length) return true
      const hay = [a.company, a.role, a.category, a.location, a.address, a.notes, a.url].filter(Boolean).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    const last = '9999-99-99'
    return [...kept].sort((a, b) => {
      if (sort === 'category') {
        const byCat = (a.category ?? '\uffff').localeCompare(b.category ?? '\uffff')
        if (byCat) return byCat
        return (a.dueDate ?? last).localeCompare(b.dueDate ?? last)
      }
      if (sort === 'due') return (a.dueDate ?? last).localeCompare(b.dueDate ?? last)
      if (sort === 'applied') return (b.dateApplied ?? '').localeCompare(a.dateApplied ?? '')
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [applications, filter, sort, category, query])

  const open = applications.filter((a) => OPEN_STATUSES.includes(a.status)).length
  const chip = (key: Status | 'open' | 'all', label: string, n: number) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${filter === key ? 'bg-sky-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
    >
      {label} {n}
    </button>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chip('open', 'Open', open)}
        {STATUSES.map((s) => chip(s, STATUS_LABEL[s], counts.get(s) ?? 0))}
        {chip('all', 'All', applications.length)}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-500">
            <span className="sr-only">Sort by</span>
            <select className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="due">Due soonest</option>
              <option value="applied">Applied recently</option>
              <option value="added">Added recently</option>
              <option value="category">Category</option>
            </select>
          </label>
          <button className={primaryClass} onClick={() => setEditing('new')}>Add job</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Search the tracker</span>
          <input
            type="search"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role, notes, address…"
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-800" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c} ({applications.filter((a) => a.category === c).length})</option>
            ))}
            <option value="-">No category ({applications.filter((a) => !a.category).length})</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-600">
          {applications.length === 0 ? 'Nothing tracked yet. Add a job here, or choose Track on a search result.' : query || category ? 'No jobs match that search.' : 'No jobs with this status.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Role</th>
                <th className="hidden py-2 pr-4 md:table-cell">
                  <button className="font-medium hover:text-sky-800" onClick={() => setSort('category')} title="Sort by category">Category{sort === 'category' ? ' ↓' : ''}</button>
                </th>
                <th className="py-2 pr-4">Status</th>
                <th className="hidden py-2 pr-4 whitespace-nowrap sm:table-cell">Applied</th>
                <th className="py-2 pr-4 whitespace-nowrap">Due</th>
                <th className="hidden py-2 pr-4 sm:table-cell">Sent</th>
                <th className="py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(a)}>
                  <td className="py-2.5 pr-4 font-medium text-gray-900">
                    <button className="text-left hover:underline" onClick={() => setEditing(a)}>{a.company}</button>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-700 sm:min-w-[12rem]">
                    {a.role}
                    {a.category && <span className="block text-xs text-gray-500 md:hidden">{a.category}</span>}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-gray-700 whitespace-nowrap md:table-cell">{a.category ?? <span className="text-gray-400">—</span>}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    {a.status === 'parked' && a.parkedUntil && <span className="ml-1 text-xs text-gray-500">until {shortDate(a.parkedUntil)}</span>}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-gray-700 whitespace-nowrap sm:table-cell">{shortDate(a.dateApplied)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap"><DueCell app={a} /></td>
                  <td className="hidden py-2.5 pr-4 text-xs text-gray-500 whitespace-nowrap sm:table-cell">{[a.resume && 'Résumé', a.letter && 'Letter'].filter(Boolean).join(', ') || '—'}</td>
                  <td className="py-2.5">
                    {a.url ? <a href={a.url} target="_blank" rel="noopener" className="text-sky-800 underline" onClick={(e) => e.stopPropagation()}>Open</a> : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Drawer
          key={editing === 'new' ? 'new' : editing.id}
          app={editing === 'new' ? null : (applications.find((a) => a.id === editing.id) ?? editing)}
          categories={categories}
          documents={documents}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
