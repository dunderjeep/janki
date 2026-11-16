'use client'

import { useEffect, useMemo, useState } from 'react'
import { ingredientChecks, per100g, servingGrams, type Ingredient } from '../lib/engine'
import { ALLERGENS, NUTRIENTS, type AllergenKey, type NutrientKey, type Nutrients } from '../lib/nutrients'
import type { CnfFood } from '../lib/cnf'
import { api, dangerClass, Field, inputClass, message, NumberField, primaryClass, secondaryClass, show } from './ui'

const same = (a: Ingredient, b: Ingredient) => JSON.stringify(a) === JSON.stringify(b)
const r6 = (x: number) => Number(x.toFixed(6))

/**
 * The rows of an EU/Norwegian package's table, read from and written to the
 * stored (Canadian-style) nutrients: its carbohydrate leaves fibre out, and it
 * gives salt in g where the store keeps sodium in mg.
 */
type Row = { key: string; label: string; unit: string; get: (n: Nutrients) => number | null; set: (n: Nutrients, v: number | null) => Nutrients }
const plain = (key: NutrientKey, label: string, unit = 'g'): Row =>
  ({ key, label, unit, get: (n) => n[key], set: (n, v) => ({ ...n, [key]: v }) })
const EU_ROWS: Row[] = [
  plain('cal', 'Energi', 'kcal'),
  plain('fat', 'Fett'),
  plain('sat', 'hvorav mettede fettsyrer'),
  {
    key: 'carb', label: 'Karbohydrat', unit: 'g',
    get: (n) => (n.carb == null ? null : r6(n.carb - (n.fibre ?? 0))),
    set: (n, v) => ({ ...n, carb: v == null ? null : r6(v + (n.fibre ?? 0)) }),
  },
  plain('sugars', 'hvorav sukkerarter'),
  {
    // Fibre moves the stored carbohydrate with it, so the EU carbohydrate typed stays put.
    key: 'fibre', label: 'Kostfiber', unit: 'g',
    get: (n) => n.fibre,
    set: (n, v) => ({ ...n, fibre: v, carb: n.carb == null ? null : r6(n.carb - (n.fibre ?? 0) + (v ?? 0)) }),
  },
  plain('protein', 'Protein'),
  {
    key: 'salt', label: 'Salt', unit: 'g',
    get: (n) => (n.sodium == null ? null : r6((n.sodium * 2.5) / 1000)),
    set: (n, v) => ({ ...n, sodium: v == null ? null : r6(v * 400) }),
  },
]
const EU_EXTRA: NutrientKey[] = ['trans', 'chol', 'potassium', 'calcium', 'iron']

/** One ingredient, entered exactly as its own package prints it. */
export function IngredientEditor({ base, ingredient, onSaved, onDeleted }: {
  base: string
  ingredient: Ingredient
  onSaved: (i: Ingredient) => void
  onDeleted: (id: string) => void
}) {
  const [draft, setDraft] = useState(ingredient)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDraft(ingredient), [ingredient])
  const dirty = !same(draft, ingredient)
  const checks = useMemo(() => ingredientChecks(draft), [draft])
  const p100 = useMemo(() => per100g(draft), [draft])
  const set = <K extends keyof Ingredient>(k: K, v: Ingredient[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await api<Ingredient>(`${base}/ingredients/${ingredient.id}`, 'PATCH', draft))
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete ${ingredient.name}?`)) return
    try {
      await api(`${base}/ingredients/${ingredient.id}`, 'DELETE')
      onDeleted(ingredient.id)
    } catch (err) {
      setError(message(err))
    }
  }

  const rows: (Row & { optional?: boolean })[] = draft.labelFormat === 'EU'
    ? [...EU_ROWS, ...EU_EXTRA.map((k) => {
        const n = NUTRIENTS.find((x) => x.key === k)!
        return { ...plain(k, `${n.en} (Canada only)`, n.unit), optional: true }
      })]
    : NUTRIENTS.map((n) => plain(n.key, n.en, n.unit))

  const toggle = (k: AllergenKey) =>
    set('allergens', draft.allergens.includes(k) ? draft.allergens.filter((a) => a !== k) : [...draft.allergens, k])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input className="min-w-0 flex-1 rounded-md border border-transparent px-1 text-xl font-semibold text-gray-900 hover:border-gray-200 focus:border-gray-200 focus:outline-none"
          value={draft.name} onChange={(e) => set('name', e.target.value)} aria-label="Ingredient name" />
        <button className={primaryClass} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        <button className={dangerClass} onClick={remove}>Delete</button>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {checks.length > 0 && (
        <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {checks.map((c) => <li key={c}>⚠ {c}</li>)}
        </ul>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Field label="Name in your ingredient list (EN)">
          <textarea className={inputClass} rows={2} value={draft.labelEn} onChange={(e) => set('labelEn', e.target.value)} />
        </Field>
        <Field label="Nom dans la liste d'ingrédients (FR)">
          <textarea className={inputClass} rows={2} value={draft.labelFr} onChange={(e) => set('labelFr', e.target.value)} />
        </Field>
        <Field label="Navn i ingredienslisten (NO)">
          <textarea className={inputClass} rows={2} value={draft.labelNo} placeholder="*hvete*mel"
            onChange={(e) => set('labelNo', e.target.value)} />
        </Field>
        <p className="text-xs text-gray-500 sm:col-span-3">
          On a Norwegian label the allergen is printed in bold. NutriLabel finds it in the name (hvetemel → <b>hvete</b>mel)
          or adds it in brackets (mozzarella (<b>melk</b>)); put *stars* around a part to choose it yourself.
        </p>
      </section>

      <section>
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">Its own nutrition table, as printed</h3>
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-xs">
            {([['CA', 'Canadian label'], ['EU', 'Norwegian / EU label']] as const).map(([f, label]) => (
              <button key={f}
                onClick={() => setDraft((d) => ({
                  ...d, labelFormat: f,
                  // EU tables are per 100 g: start there when nothing is typed yet.
                  ...(f === 'EU' && d.servingAmount == null ? { servingAmount: 100, servingUnit: 'g' as const, printed: d.printed || '100 g' } : {}),
                }))}
                className={`rounded px-2 py-0.5 ${draft.labelFormat === f ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Type the serving and the amounts exactly as the package shows them; NutriLabel works out per 100 g.
          {draft.labelFormat === 'EU' && ' On an EU label carbohydrate leaves out fibre and salt stands in for sodium; type them as printed.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Source">
            <select className={inputClass} value={draft.source} onChange={(e) => set('source', e.target.value)}>
              {['Label', 'CNF', 'USDA', 'Lab', 'Custom'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Serving as printed">
            <input className={inputClass} value={draft.printed} placeholder="1/8 tsp (0.7 g)" onChange={(e) => set('printed', e.target.value)} />
          </Field>
          <Field label="Serving amount">
            <div className="flex gap-1">
              <NumberField value={draft.servingAmount} onChange={(v) => set('servingAmount', v)} />
              <select className={`${inputClass} w-16`} value={draft.servingUnit} onChange={(e) => set('servingUnit', e.target.value as 'g' | 'mL')}>
                <option>g</option><option>mL</option>
              </select>
            </div>
          </Field>
          {draft.servingUnit === 'mL' ? (
            <Field label="Grams per mL">
              <NumberField value={draft.gPerMl} onChange={(v) => set('gPerMl', v)} placeholder="weigh 100 mL ÷ 100" />
            </Field>
          ) : <div className="self-end pb-2 text-xs text-gray-500">= {show(servingGrams(draft), 2)} g</div>}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pr-3 font-medium">Nutrient</th>
                <th className="w-28 pr-3 font-medium">Per serving</th>
                <th className="pr-3 text-right font-medium">Per 100 g</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-0.5 pr-3 text-gray-700">{r.label} <span className="text-gray-400">({r.unit})</span></td>
                  <td className="py-0.5 pr-3">
                    <NumberField value={r.get(draft.nutrients)} placeholder={r.optional ? 'not on it' : 'blank'}
                      onChange={(v) => set('nutrients', r.set(draft.nutrients, v))} />
                  </td>
                  <td className="py-0.5 pr-3 text-right tabular-nums text-gray-500">{p100 ? show(r.get(p100), 3) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Allergens it brings</h3>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGENS.map((a) => (
            <button key={a.key} onClick={() => toggle(a.key)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${draft.allergens.includes(a.key) ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
              {a.en}{!a.ca && <span className="text-gray-400"> (EU)</span>}
            </button>
          ))}
        </div>
      </section>

      <Field label="Notes">
        <textarea className={inputClass} rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

/** Search Health Canada's Canadian Nutrient File and copy a food in as an ingredient, per 100 g. */
export function CnfSearch({ base, onAdded }: { base: string; onAdded: (i: Ingredient) => void }) {
  const [q, setQ] = useState('')
  const [foods, setFoods] = useState<CnfFood[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) {
      setFoods(null)
      return
    }
    const t = setTimeout(() => {
      api<{ foods: CnfFood[] }>(`${base}/cnf?q=${encodeURIComponent(q)}`).then((r) => setFoods(r.foods), (e) => setError(message(e)))
    }, 250)
    return () => clearTimeout(t)
  }, [q, base])

  async function add(f: CnfFood) {
    setError('')
    try {
      onAdded(await api<Ingredient>(`${base}/cnf/${f.code}`, 'POST', {}))
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="space-y-2">
      <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Canadian Nutrient File: butter, maple syrup…" />
      {error && <p className="text-xs text-red-700">{error}</p>}
      {foods && (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-sm">
          {foods.length === 0 && <li className="px-2 py-1.5 text-gray-500">Nothing found.</li>}
          {foods.map((f) => (
            <li key={f.code} className="flex items-start gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="text-gray-900">{f.en}</div>
                <div className="text-xs text-gray-500">{f.fr} · {f.group} · {show(f.per100.cal, 0)} kcal / 100 g</div>
              </div>
              <button className={secondaryClass} onClick={() => add(f)}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
