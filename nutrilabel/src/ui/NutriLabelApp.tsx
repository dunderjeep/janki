'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { computeFacts, ingredientChecks, type Ingredient, type Product } from '../lib/engine'
import { computeEu } from '../lib/eu'
import { REFERENCE_AMOUNTS } from '../lib/ra'
import type { Market, Settings } from '../lib/store'
import { CnfSearch, IngredientEditor } from './IngredientEditor'
import ProductEditor from './ProductEditor'
import { api, Field, inputClass, message, primaryClass, secondaryClass } from './ui'

type Tab = 'products' | 'ingredients' | 'business'

export type NutriLabelAppProps = {
  /** Where the host mounted the API. */
  base?: string
  initialIngredients: Ingredient[]
  initialProducts: Product[]
  initialSettings: Settings
  /** The host's name for its recipes (janki: "Kitchen"), or null when it has none. */
  recipeSource: string | null
  initialTab?: string
  /** Optional host content above the tabs. */
  panel?: ReactNode
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

export function NutriLabelApp({ base = '/api/nutrilabel', initialIngredients, initialProducts, initialSettings, recipeSource, initialTab, panel }: NutriLabelAppProps) {
  const [tab, setTab] = useState<Tab>(initialTab === 'ingredients' || initialTab === 'business' ? initialTab : 'products')
  const [ingredients, setIngredients] = useState(initialIngredients)
  const [products, setProducts] = useState(initialProducts)
  const [settings, setSettings] = useState(initialSettings)
  const [productId, setProductId] = useState<string | null>(initialProducts[0]?.id ?? null)
  const [ingredientId, setIngredientId] = useState<string | null>(initialIngredients[0]?.id ?? null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState<{ id: string; title: string; detail?: string }[] | null>(null)
  const [notice, setNotice] = useState('')
  const [market, setMarket] = useState<Market>(initialSettings.market)

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const product = products.find((p) => p.id === productId) ?? null
  const ingredient = ingredients.find((i) => i.id === ingredientId) ?? null
  const warnCount = useMemo(
    () => new Map(products.map((p) => [p.id,
      (market === 'NO' ? computeEu(p, ingById) : computeFacts(p, ingById, REFERENCE_AMOUNTS)).warnings.length])),
    [products, ingById, market],
  )

  const upsertProduct = (p: Product) => setProducts((ps) => [...ps.filter((x) => x.id !== p.id), p].sort(byName))
  const upsertIngredient = (i: Ingredient) => setIngredients((is) => [...is.filter((x) => x.id !== i.id), i].sort(byName))

  async function newProduct() {
    const name = prompt('Name of the new product')?.trim()
    if (!name) return
    try {
      const p = await api<Product>(`${base}/products`, 'POST', { name, nameEn: name, lines: [] })
      upsertProduct(p)
      setProductId(p.id)
    } catch (err) {
      setError(message(err))
    }
  }

  async function newIngredient() {
    const name = prompt('Name of the new ingredient (your own name for it)')?.trim()
    if (!name) return
    try {
      const i = await api<Ingredient>(`${base}/ingredients`, 'POST', {
        name, labelEn: name.toLowerCase(), ...(market === 'NO' ? { labelNo: name.toLowerCase(), labelFormat: 'EU', servingAmount: 100, printed: '100 g' } : {}),
      })
      upsertIngredient(i)
      setIngredientId(i.id)
    } catch (err) {
      setError(message(err))
    }
  }

  async function openImport() {
    setError('')
    try {
      setImporting((await api<{ recipes: { id: string; title: string; detail?: string }[] }>(`${base}/recipes`)).recipes)
    } catch (err) {
      setError(message(err))
    }
  }

  async function importRecipe(id: string) {
    try {
      const r = await api<{ product: Product; added: string[]; ingredients: Ingredient[] }>(`${base}/recipes/${id}/import`, 'POST')
      setIngredients(r.ingredients)
      upsertProduct(r.product)
      setProductId(r.product.id)
      setImporting(null)
      setNotice(r.added.length
        ? `Imported. New ingredients to fill in from their labels: ${r.added.join(', ')}.`
        : 'Imported. Every ingredient was already in your library.')
    } catch (err) {
      setError(message(err))
    }
  }

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">NutriLabel</h1>
        <p className="text-sm text-gray-500">Nutrition tables and package labels from your recipes: Canada (English/French) and Norway.</p>
      </header>
      {panel}
      <nav className="mb-5 flex gap-1 border-b border-gray-200">
        {([['products', 'Products'], ['ingredients', 'Ingredients'], ['business', 'Business']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-emerald-700 font-medium text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </nav>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setError('')}>{error}</p>}
      {notice && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900" onClick={() => setNotice('')}>{notice}</p>}

      {tab === 'products' && (
        <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button className={primaryClass} onClick={newProduct}>New product</button>
              {recipeSource && <button className={secondaryClass} onClick={openImport}>From {recipeSource}…</button>}
            </div>
            {importing && (
              <div className="rounded-md border border-gray-200 p-2 text-sm">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>{recipeSource} recipes</span>
                  <button onClick={() => setImporting(null)}>×</button>
                </div>
                {importing.length === 0 && <p className="text-gray-500">No recipes there yet.</p>}
                {importing.map((r) => (
                  <button key={r.id} className="block w-full rounded px-1.5 py-1 text-left hover:bg-gray-50" onClick={() => importRecipe(r.id)}>
                    {r.title}{r.detail && <span className="block text-xs text-gray-500">{r.detail}</span>}
                  </button>
                ))}
              </div>
            )}
            <ul className="space-y-0.5">
              {products.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setProductId(p.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${p.id === productId ? 'bg-emerald-50 text-emerald-900' : 'text-gray-700 hover:bg-gray-50'}`}>
                    <span className="truncate">{p.name}</span>
                    {(warnCount.get(p.id) ?? 0) > 0 && <span className="ml-2 text-xs text-amber-600" title="Has warnings">⚠ {warnCount.get(p.id)}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {!products.length && <p className="text-sm text-gray-500">No products yet. Start one, then build its recipe from your ingredients.</p>}
          </aside>
          <main className="min-w-0">
            {product
              ? <ProductEditor key={product.id} base={base} product={product} ingredients={ingredients} settings={settings}
                  market={market} onMarket={setMarket}
                  onSaved={upsertProduct}
                  onDuplicated={(p) => { upsertProduct(p); setProductId(p.id) }}
                  onDeleted={(id) => { setProducts((ps) => ps.filter((p) => p.id !== id)); setProductId(null) }}
                  onOpenIngredient={(id) => { setIngredientId(id); setTab('ingredients') }} />
              : <p className="text-sm text-gray-500">Choose a product.</p>}
          </main>
        </div>
      )}

      {tab === 'ingredients' && (
        <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <button className={primaryClass} onClick={newIngredient}>New ingredient</button>
            <details className="rounded-md border border-gray-200 p-2" open={!ingredients.length}>
              <summary className="cursor-pointer text-sm text-gray-700">From the Canadian Nutrient File</summary>
              <div className="mt-2">
                <CnfSearch base={base} onAdded={(i) => { upsertIngredient(i); setIngredientId(i.id) }} />
              </div>
            </details>
            <ul className="space-y-0.5">
              {ingredients.map((i) => {
                const n = ingredientChecks(i).length
                return (
                  <li key={i.id}>
                    <button onClick={() => setIngredientId(i.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${i.id === ingredientId ? 'bg-emerald-50 text-emerald-900' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <span className="truncate">{i.name}</span>
                      <span className="ml-2 flex shrink-0 gap-1 text-xs">
                        <span className="text-gray-400">{i.source}</span>
                        {n > 0 && <span className="text-amber-600" title="Has checks to look at">⚠ {n}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>
          <main className="min-w-0 max-w-3xl">
            {ingredient
              ? <IngredientEditor key={ingredient.id} base={base} ingredient={ingredient} onSaved={upsertIngredient}
                  onDeleted={(id) => { setIngredients((is) => is.filter((i) => i.id !== id)); setIngredientId(null) }} />
              : <p className="text-sm text-gray-500">Choose an ingredient, or add one from a package you have.</p>}
          </main>
        </div>
      )}

      {tab === 'business' && <BusinessForm base={base} settings={settings} onSaved={(s) => { setSettings(s); setMarket(s.market) }} />}

      <footer className="mt-10 border-t border-gray-100 pt-3 text-xs text-gray-400">
        Canada: rounding CFIA, FDR B.01.401; Daily Values Health Canada, 2022; reference amounts Health Canada, October 2024.
        Norway: Regulation (EU) 1169/2011 as taken into matinformasjonsforskriften; rounding European Commission guidance, 2012.
        Food data: Canadian Nutrient File, Health Canada. NutriLabel helps with the arithmetic; you are responsible for your label.
      </footer>
    </div>
  )
}

function BusinessForm({ base, settings, onSaved }: { base: string; settings: Settings; onSaved: (s: Settings) => void }) {
  const [draft, setDraft] = useState(settings)
  const [state, setState] = useState('')
  async function save() {
    setState('Saving…')
    try {
      onSaved(await api<Settings>(`${base}/settings`, 'PUT', draft))
      setState('Saved')
    } catch (err) {
      setState(message(err))
    }
  }
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-gray-500">Printed as &ldquo;Prepared by&rdquo; (Norway: &ldquo;Produsent&rdquo;) on package labels, unless a product names someone else.</p>
      <Field label="Business name"><input className={inputClass} value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} /></Field>
      <Field label="Address"><input className={inputClass} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
      <Field label="Labels you make">
        <select className={inputClass} value={draft.market} onChange={(e) => setDraft({ ...draft, market: e.target.value as Market })}>
          <option value="CA">Canada: bilingual Nutrition Facts</option>
          <option value="NO">Norway: næringsdeklarasjon</option>
        </select>
      </Field>
      <Field label="Email or website"><input className={inputClass} value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></Field>
      <div className="flex items-center gap-3">
        <button className={primaryClass} onClick={save}>Save</button>
        <span className="text-sm text-gray-500">{state}</span>
      </div>
    </div>
  )
}
