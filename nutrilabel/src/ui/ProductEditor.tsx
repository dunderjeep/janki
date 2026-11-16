'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { computeFacts, per100g, type Ingredient, type Product } from '../lib/engine'
import { computeEu, EU_KEYS, type EuFacts } from '../lib/eu'
import { DAILY_VALUES, NUTRIENTS, REFERENCE_INTAKES, type RiKey } from '../lib/nutrients'
import { REFERENCE_AMOUNTS } from '../lib/ra'
import type { Market, Settings } from '../lib/store'
import { LABEL_CSS, NorwegianTable, PackageLabel, PackageLabelNo, printLabel, StandardTable } from './labels'
import { api, dangerClass, Field, inputClass, message, NumberField, primaryClass, secondaryClass, show } from './ui'

type Props = {
  base: string
  product: Product
  ingredients: Ingredient[]
  settings: Settings
  /** Which label is showing; the app keeps it so it survives switching products. */
  market: Market
  onMarket: (m: Market) => void
  onSaved: (p: Product) => void
  onDeleted: (id: string) => void
  onDuplicated: (p: Product) => void
  onOpenIngredient: (id: string) => void
}

const same = (a: Product, b: Product) => JSON.stringify(a) === JSON.stringify(b)

export default function ProductEditor({ base, product, ingredients, settings, market, onMarket, onSaved, onDeleted, onDuplicated, onOpenIngredient }: Props) {
  const [draft, setDraft] = useState(product)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState<'standard' | 'package'>('package')
  const [showWorking, setShowWorking] = useState(false)
  const labelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(product), [product])
  const dirty = !same(draft, product)

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const facts = useMemo(() => computeFacts(draft, byId, REFERENCE_AMOUNTS), [draft, byId])
  const eu = useMemo(() => computeEu(draft, byId), [draft, byId])
  const no = market === 'NO'
  const warnings = no ? eu.warnings : facts.warnings
  const ra = REFERENCE_AMOUNTS.find((r) => r.item === draft.raItem)
  const batchSum = draft.lines.reduce((s, l) => s + (l.grams ?? 0), 0)

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setLine = (i: number, patch: Partial<Product['lines'][number]>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))

  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await api<Product>(`${base}/products/${product.id}`, 'PATCH', draft))
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  // Ctrl+S / Cmd+S saves.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function remove() {
    if (!confirm(`Delete ${product.name}? Its recipe goes with it; the ingredients stay.`)) return
    try {
      await api(`${base}/products/${product.id}`, 'DELETE')
      onDeleted(product.id)
    } catch (err) {
      setError(message(err))
    }
  }

  async function duplicate() {
    try {
      onDuplicated(await api<Product>(`${base}/products/${product.id}/duplicate`, 'POST'))
    } catch (err) {
      setError(message(err))
    }
  }

  const text = (k: keyof Product, label: string, placeholder?: string, className?: string) => (
    <Field label={label} className={className}>
      <input className={inputClass} value={String(draft[k] ?? '')} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  )

  const sorted = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name)), [ingredients])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
      <style>{LABEL_CSS}</style>
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-0 flex-1 rounded-md border border-transparent px-1 text-xl font-semibold text-gray-900 hover:border-gray-200 focus:border-gray-200 focus:outline-none"
            value={draft.name} onChange={(e) => set('name', e.target.value)} aria-label="Product name" />
          <button className={primaryClass} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
          <button className={secondaryClass} onClick={duplicate} disabled={dirty}>Duplicate</button>
          <button className={dangerClass} onClick={remove}>Delete</button>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Recipe */}
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Recipe: grams per batch</h3>
          <p className="mb-2 text-xs text-gray-500">The label lists ingredients heaviest first, whatever order you type them in.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-1 font-medium">Ingredient</th>
                <th className="w-28 pb-1 font-medium">Grams</th>
                <th className="w-16 pb-1 text-right font-medium">Share</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l, i) => {
                const ing = byId.get(l.ingredientId)
                const noWeight = ing && per100g(ing) == null
                return (
                  <tr key={i} className="align-middle">
                    <td className="py-0.5 pr-2">
                      <div className="flex items-center gap-1">
                        <select className={inputClass} value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })}>
                          {!ing && <option value="">Choose…</option>}
                          {sorted.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        {ing && (
                          <button className="shrink-0 px-1 text-xs text-gray-400 hover:text-emerald-700" title="Open this ingredient"
                            onClick={() => onOpenIngredient(ing.id)}>{noWeight ? <span className="text-amber-600">⚠</span> : '↗'}</button>
                        )}
                      </div>
                    </td>
                    <td className="py-0.5 pr-2"><NumberField value={l.grams} onChange={(v) => setLine(i, { grams: v })} /></td>
                    <td className="py-0.5 text-right tabular-nums text-gray-500">{batchSum ? `${show(((l.grams ?? 0) / batchSum) * 100, 1)} %` : ''}</td>
                    <td className="py-0.5 text-right">
                      <button className="px-1 text-gray-400 hover:text-red-600" aria-label="Remove line"
                        onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-1">
                  <button className={secondaryClass} disabled={!ingredients.length}
                    onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { ingredientId: sorted[0]?.id ?? '', grams: null }] }))}>
                    + Ingredient
                  </button>
                  {!ingredients.length && <span className="ml-2 text-xs text-gray-500">Add ingredients on the Ingredients tab first.</span>}
                </td>
                <td className="pt-1 text-sm tabular-nums text-gray-600">{show(batchSum, 1)} g</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Finished batch weight, g (blank = the sum: no loss)">
              <NumberField value={draft.batchWeightG} onChange={(v) => set('batchWeightG', v)} placeholder={batchSum ? show(batchSum, 1) : ''} />
            </Field>
          </div>
        </section>

        {/* Serving */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">{no ? 'Portion' : 'Serving'}</h3>
          {no && (
            <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={draft.euPortion} onChange={(e) => set('euPortion', e.target.checked)} />
              Add a per-portion column and %RI (optional in Norway; the table is always per 100 {eu.basis})
            </label>
          )}
          {!no && <>
          <Field label="Reference amount (Health Canada, Oct 2024)">
            <select className={inputClass} value={draft.raItem} onChange={(e) => set('raItem', e.target.value)}>
              <option value="">Choose the food category…</option>
              {REFERENCE_AMOUNTS.map((r) => (
                <option key={r.item} value={r.item}>{r.item} · {r.ra} · {r.category.length > 90 ? `${r.category.slice(0, 90)}…` : r.category}</option>
              ))}
            </select>
          </Field>
          {ra && (
            <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p><b>{ra.item}</b> {ra.category}</p>
              <p className="mt-1"><b>RA:</b> {ra.ra}. <b>Declare as:</b> {ra.units}</p>
              {ra.criteria && <p className="mt-1"><b>Multiple-serving packages:</b> {ra.criteria}</p>}
              {ra.amount != null && ra.unit && (draft.mm !== ra.amount || draft.mmUnit !== ra.unit) && (
                <button className="mt-1 text-emerald-700 hover:underline" onClick={() => setDraft((d) => ({ ...d, mm: ra.amount, mmUnit: ra.unit! }))}>
                  Use {ra.amount} {ra.unit} as the serving
                </button>
              )}
            </div>
          )}
          </>}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {no ? text('hmNo', 'Portion described', '1 skive') : <>
              {text('hmEn', 'Household measure', '3/4 cup')}
              {text('hmFr', 'Mesure domestique', '3/4 tasse')}
            </>}
            <Field label={no ? 'Portion size' : 'Metric serving'}>
              <div className="flex gap-1">
                <NumberField value={draft.mm} onChange={(v) => set('mm', v)} />
                <select className={`${inputClass} w-16`} value={draft.mmUnit} onChange={(e) => set('mmUnit', e.target.value as 'g' | 'mL')}>
                  <option>g</option><option>mL</option>
                </select>
              </div>
            </Field>
            <Field label={draft.mmUnit === 'mL' ? 'One serving weighs, g' : 'Serving weight g (optional)'}>
              <NumberField value={draft.servingWeightG} onChange={(v) => set('servingWeightG', v)}
                className={`${inputClass} ${draft.mmUnit === 'mL' && draft.servingWeightG == null ? 'border-amber-400' : ''}`} />
            </Field>
          </div>
          {draft.mmUnit === 'mL' && <p className="mt-1 text-xs text-gray-500">Weigh {draft.mm ?? 'one serving of'} mL of the finished product and enter the grams.</p>}
        </section>

        {/* Package */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">On the package</h3>
          {no ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {text('nameNo', 'Navn (NO)', draft.nameEn || draft.name, 'sm:col-span-2')}
              {text('price', 'Pris (kr)')}
              {text('netQuantity', 'Nettovekt / nettoinnhold', '250 g')}
              {text('storageNo', 'Oppbevaring', 'Oppbevares kjølig, 0–4 °C')}
              {text('durabilityNo', 'Holdbarhet', 'Best før: se lokket')}
              {text('allergyNoteNo', 'Allergi-merknad (valgfri)', 'Kan inneholde spor av nøtter.', 'sm:col-span-2')}
              {text('preparedBy', 'Produsent (blank = your business)', [settings.businessName, settings.address].filter(Boolean).join(', '), 'sm:col-span-2')}
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {text('nameEn', 'Name (EN)')}
            {text('nameFr', 'Nom (FR)')}
            {text('price', 'Price')}
            {text('netQuantity', 'Net quantity', '500 mL')}
            {text('storageEn', 'Storage (EN)', 'Keep frozen')}
            {text('storageFr', 'Conservation (FR)', 'Garder congelé')}
            {text('containsEn', 'Contains (EN), blank = from the ingredients', facts.containsDerived ? facts.containsEn : '')}
            {text('containsFr', 'Contient (FR)', facts.containsDerived ? facts.containsFr : '')}
            {text('preparedBy', 'Prepared by (blank = your business)', [settings.businessName, settings.address].filter(Boolean).join(', '), 'sm:col-span-2')}
          </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-500">Write the ingredient {no ? 'list' : 'lists'} by hand instead</summary>
            {no ? (
              <Field label="Ingredienser (NO), blank = generated. Put *stars* around each allergen to print it in bold." className="mt-2">
                <textarea className={inputClass} rows={3} value={draft.ingredientsNo} placeholder={eu.ingredients}
                  onChange={(e) => set('ingredientsNo', e.target.value)} />
              </Field>
            ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Ingredients (EN), blank = generated">
                <textarea className={inputClass} rows={3} value={draft.ingredientsEn} placeholder={facts.ingredientsEn}
                  onChange={(e) => set('ingredientsEn', e.target.value)} />
              </Field>
              <Field label="Ingrédients (FR)">
                <textarea className={inputClass} rows={3} value={draft.ingredientsFr} placeholder={facts.ingredientsFr}
                  onChange={(e) => set('ingredientsFr', e.target.value)} />
              </Field>
            </div>
            )}
          </details>
          <Field label="Notes" className="mt-3">
            <textarea className={inputClass} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </section>
      </div>

      {/* The label, and how it was worked out */}
      <aside className="space-y-3 xl:w-[34rem]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
            {([['CA', 'Canada'], ['NO', 'Norge']] as const).map(([m, label]) => (
              <button key={m} onClick={() => onMarket(m)}
                className={`rounded px-2.5 py-1 ${market === m ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
            {(['package', 'standard'] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)}
                className={`rounded px-2.5 py-1 ${format === f ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {f === 'package' ? 'Package label' : 'Table only'}
              </button>
            ))}
          </div>
          <button className={secondaryClass} onClick={() => printLabel(labelRef.current, draft.name)}>Print…</button>
          <button className="text-sm text-emerald-700 hover:underline" onClick={() => setShowWorking((s) => !s)}>
            {showWorking ? 'Hide the working' : 'Show the working'}
          </button>
        </div>
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}
        <div ref={labelRef} className="overflow-x-auto">
          {no
            ? format === 'package'
              ? <PackageLabelNo product={draft} eu={eu} settings={settings} />
              : <NorwegianTable product={draft} eu={eu} />
            : format === 'package'
              ? <PackageLabel product={draft} facts={facts} settings={settings} />
              : <StandardTable product={draft} facts={facts} />}
        </div>
        {showWorking && (no ? <WorkingEu eu={eu} /> : <Working facts={facts} />)}
      </aside>
    </div>
  )
}

/** Every number on the label traced back: per 100 g of the batch → one serving → CFIA rounding → % DV. */
function Working({ facts }: { facts: ReturnType<typeof computeFacts> }) {
  if (!facts.per100) return <p className="text-xs text-gray-500">Nothing to show until the recipe has ingredients with weights.</p>
  const dvOf = (k: string) => (k === 'sat' ? 'sattrans' : k)
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-2 py-1 font-medium">Nutrient</th>
            <th className="px-2 py-1 text-right font-medium">per 100 g</th>
            <th className="px-2 py-1 text-right font-medium">per {show(facts.servingG, 1)} g</th>
            <th className="px-2 py-1 font-medium">CFIA step</th>
            <th className="px-2 py-1 text-right font-medium">Label</th>
            <th className="px-2 py-1 text-right font-medium">% DV</th>
          </tr>
        </thead>
        <tbody>
          {NUTRIENTS.map((n) => {
            const s = facts.declared?.[n.key]
            const dk = dvOf(n.key)
            const dv = DAILY_VALUES.find((x) => x.key === dk)
            return (
              <tr key={n.key} className="border-t border-gray-100">
                <td className="px-2 py-0.5">{n.en} ({n.unit})</td>
                <td className="px-2 py-0.5 text-right">{show(facts.per100![n.key])}</td>
                <td className="px-2 py-0.5 text-right">{show(s?.raw ?? null, 3)}</td>
                <td className="px-2 py-0.5 text-gray-500">{s?.rule ?? ''}</td>
                <td className="px-2 py-0.5 text-right font-semibold">{s ? show(s.declared) : '–'}</td>
                <td className="px-2 py-0.5 text-right" title={dv ? `÷ ${dv.dv} ${dv.unit}` : ''}>
                  {dv && facts.dv && n.key !== 'trans' ? `${facts.dv[dv.key]} %` : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-gray-100 px-2 py-1 text-[11px] text-gray-500">
        % DV is worked out from the rounded amount, against Health Canada&apos;s 2022 Daily Values (hover for the divisor).
        Saturated and trans share one % DV, from their sum.
      </p>
    </div>
  )
}

const EU_LABEL: Record<string, string> = {
  kj: 'Energy (kJ)', kcal: 'Energy (kcal)', fat: 'Fat (g)', sat: 'of which saturates (g)', carb: 'Carbohydrate (g)',
  sugars: 'of which sugars (g)', fibre: 'Fibre (g)', protein: 'Protein (g)', salt: 'Salt (g)',
}

/** The Norwegian table traced back: per 100 → EU rounding, per portion → %RI. */
function WorkingEu({ eu }: { eu: EuFacts }) {
  if (!eu.per100 || !eu.col100) return <p className="text-xs text-gray-500">Nothing to show until the recipe has ingredients with weights.</p>
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-2 py-1 font-medium">Nutrient</th>
            <th className="px-2 py-1 text-right font-medium">per 100 {eu.basis}</th>
            <th className="px-2 py-1 font-medium">EU step</th>
            <th className="px-2 py-1 text-right font-medium">Label</th>
            {eu.colPortion && <th className="px-2 py-1 text-right font-medium">per portion</th>}
            {eu.colPortion && <th className="px-2 py-1 text-right font-medium">%RI</th>}
          </tr>
        </thead>
        <tbody>
          {EU_KEYS.map((k) => (
            <tr key={k} className="border-t border-gray-100">
              <td className="px-2 py-0.5">{EU_LABEL[k]}</td>
              <td className="px-2 py-0.5 text-right">{show(eu.per100![k], 3)}</td>
              <td className="px-2 py-0.5 text-gray-500">{eu.col100![k].rule}</td>
              <td className="px-2 py-0.5 text-right font-semibold">{eu.col100![k].text}</td>
              {eu.colPortion && <td className="px-2 py-0.5 text-right">{eu.colPortion[k].text} <span className="text-gray-400">({show(eu.colPortion[k].raw, 3)})</span></td>}
              {eu.colPortion && (
                <td className="px-2 py-0.5 text-right" title={k === 'fibre' ? 'No reference intake' : `÷ ${REFERENCE_INTAKES[k as RiKey]}`}>
                  {eu.ri?.[k] != null ? `${eu.ri[k]} %` : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 border-t border-gray-100 px-2 py-1 text-[11px] text-gray-500">
        <p>Carbohydrate here leaves fibre out (the EU way); salt is sodium × 2.5.</p>
        <p>
          Energy is worked out from the nutrients (Regulation 1169/2011, Annex XIV): fat × 37 kJ / 9 kcal, carbohydrate and
          protein × 17 / 4, fibre × 8 / 2. The ingredients&apos; own labels add up to {show(eu.kcalFromLabels, 0)} kcal
          per 100 {eu.basis}{eu.kcalFromLabels != null && Math.abs(eu.kcalFromLabels - eu.per100.kcal) > 0.1 * eu.per100.kcal
            ? '; that is more than 10 % away, so check the ingredient data (or polyols or alcohol in the recipe).' : '.'}
        </p>
        <p>Rounding: European Commission guidance on tolerances (2012). %RI is from the unrounded amount, against Annex XIII.</p>
      </div>
    </div>
  )
}
