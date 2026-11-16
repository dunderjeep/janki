'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, message } from '@/components/chains/NextList'
import { ALLERGENS } from '@/lib/kitchen/allergens'
import type { Ingredient, Recipe, RecipeSummary } from '@/lib/kitchen/recipes'

const nok = (n: number) => `NOK ${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const allergenLabel = (key: string) => ALLERGENS.find((a) => a.key === key)?.en ?? key

type Draft = {
  id: string | null
  title: string
  yieldQty: string
  yieldUnit: string
  method: string
  notes: string
  ingredients: { name: string; quantity: string; unit: string; allergens: string[]; costNok: string }[]
}

const blankRow = () => ({ name: '', quantity: '', unit: '', allergens: [] as string[], costNok: '' })
const str = (n: number | null) => (n === null ? '' : String(n))

function toDraft(r: Recipe | null): Draft {
  if (!r) return { id: null, title: '', yieldQty: '', yieldUnit: '', method: '', notes: '', ingredients: [blankRow()] }
  return {
    id: r.id,
    title: r.title,
    yieldQty: str(r.yieldQty),
    yieldUnit: r.yieldUnit,
    method: r.method,
    notes: r.notes,
    ingredients: [
      ...r.ingredients.map((i: Ingredient) => ({ name: i.name, quantity: str(i.quantity), unit: i.unit, allergens: i.allergens, costNok: str(i.costNok) })),
      blankRow(),
    ],
  }
}

const field = 'rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500'

function Editor({ draft, setDraft, onSave, onCancel, onDelete, busy }: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (() => void) | null
  busy: boolean
}) {
  const rows = draft.ingredients
  const setRow = (i: number, patch: Partial<Draft['ingredients'][number]>) => {
    const next = rows.map((r, k) => (k === i ? { ...r, ...patch } : r))
    // Always keep one empty row at the bottom to type into.
    if (next[next.length - 1].name.trim()) next.push(blankRow())
    setDraft({ ...draft, ingredients: next })
  }
  const toggle = (i: number, key: string) => {
    const has = rows[i].allergens.includes(key)
    setRow(i, { allergens: has ? rows[i].allergens.filter((a) => a !== key) : [...rows[i].allergens, key] })
  }
  const allergens = [...new Set(rows.filter((r) => r.name.trim()).flatMap((r) => r.allergens))]
  const cost = rows.reduce((s, r) => s + (Number(r.costNok.replace(',', '.')) || 0), 0)
  const yieldQty = Number(draft.yieldQty.replace(',', '.'))

  return (
    <form
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input className={`${field} min-w-0 flex-1 basis-64 text-base font-medium`} placeholder="Recipe title, e.g. Butter tarts" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input className={`${field} w-20`} inputMode="decimal" placeholder="Makes" value={draft.yieldQty} onChange={(e) => setDraft({ ...draft, yieldQty: e.target.value })} />
        <input className={`${field} w-28`} placeholder="tarts" value={draft.yieldUnit} onChange={(e) => setDraft({ ...draft, yieldUnit: e.target.value })} />
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-700">Ingredients</h3>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-md border border-gray-100 p-2">
              <div className="flex flex-wrap gap-2">
                <input className={`${field} w-20`} inputMode="decimal" placeholder="Amount" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
                <input className={`${field} w-20`} placeholder="g, dl…" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} />
                <input className={`${field} min-w-0 flex-1 basis-40`} placeholder={i === rows.length - 1 ? 'Add an ingredient' : 'Ingredient'} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                <input className={`${field} w-24`} inputMode="decimal" placeholder="Cost NOK" value={r.costNok} onChange={(e) => setRow(i, { costNok: e.target.value })} />
              </div>
              {r.name.trim() && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ALLERGENS.map((a) => {
                    const on = r.allergens.includes(a.key)
                    return (
                      <button
                        type="button"
                        key={a.key}
                        title={a.no}
                        onClick={() => toggle(i, a.key)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-gray-200 text-gray-400 hover:text-gray-700'}`}
                      >
                        {a.en}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-gray-50 px-3 py-2 text-sm">
        <span>
          <span className="text-gray-500">Contains: </span>
          {allergens.length ? <strong className="text-amber-900">{allergens.map(allergenLabel).join(', ')}</strong> : <span className="text-gray-500">no listed allergens</span>}
        </span>
        {cost > 0 && (
          <span>
            <span className="text-gray-500">Batch cost: </span>
            {nok(cost)}
            {yieldQty > 0 && <span className="text-gray-500"> · {nok(cost / yieldQty)} per {draft.yieldUnit.replace(/s$/, '') || 'piece'}</span>}
          </span>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Method</span>
        <textarea className={`${field} h-48 w-full`} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Notes</span>
        <textarea className={`${field} h-20 w-full`} placeholder="Oven quirks, storage, shelf life, what to try next…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-800 disabled:opacity-50">{busy ? 'Saving…' : 'Save recipe'}</button>
        <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="ml-auto text-sm text-gray-400 hover:text-red-700" onClick={onDelete}>Delete recipe</button>}
      </div>
    </form>
  )
}

/** A front's recipes, with allergens and cost per batch worked out as you type. */
export default function FrontRecipes({ frontId }: { frontId: string }) {
  const [list, setList] = useState<RecipeSummary[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setList((await api<{ recipes: RecipeSummary[] }>(`/api/kitchen/recipes?front=${frontId}`)).recipes)
    } catch (err) {
      setError(message(err))
    }
  }, [frontId])
  useEffect(() => void load(), [load])

  const open = async (id: string) => {
    setError(null)
    try {
      setDraft(toDraft(await api<Recipe>(`/api/kitchen/recipes/${id}`)))
    } catch (err) {
      setError(message(err))
    }
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    const body = {
      title: draft.title,
      yieldQty: draft.yieldQty,
      yieldUnit: draft.yieldUnit,
      method: draft.method,
      notes: draft.notes,
      ingredients: draft.ingredients.filter((r) => r.name.trim()),
    }
    try {
      const saved = draft.id
        ? await api<Recipe>(`/api/kitchen/recipes/${draft.id}`, 'PUT', body)
        : await api<Recipe>(`/api/kitchen/recipes?front=${frontId}`, 'POST', body)
      setDraft(toDraft(saved))
      await load()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || !confirm(`Delete the recipe "${draft.title}"?`)) return
    try {
      await api(`/api/kitchen/recipes/${draft.id}`, 'DELETE')
      setDraft(null)
      await load()
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      {draft ? (
        <Editor draft={draft} setDraft={setDraft} onSave={() => void save()} onCancel={() => setDraft(null)} onDelete={draft.id ? () => void remove() : null} busy={busy} />
      ) : (
        <>
          <button className="rounded-md bg-sky-700 px-3 py-1 text-sm text-white hover:bg-sky-800" onClick={() => setDraft(toDraft(null))}>+ New recipe</button>
          {list === null ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-500">No recipes yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {list.map((r) => (
                <li key={r.id}>
                  <button className="flex w-full flex-wrap items-baseline gap-x-3 px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => void open(r.id)}>
                    <span className="font-medium text-sky-800">{r.title}</span>
                    {r.yieldQty !== null && <span className="text-gray-500">makes {r.yieldQty} {r.yieldUnit}</span>}
                    {r.allergens.length > 0 && <span className="text-xs text-amber-800">{r.allergens.map(allergenLabel).join(', ')}</span>}
                    <span className="ml-auto text-xs text-gray-400">
                      {r.costNok !== null && `${nok(r.costNok)} · `}
                      {r.updatedAt}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
