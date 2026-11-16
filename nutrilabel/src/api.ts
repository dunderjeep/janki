/**
 * NutriLabel's HTTP API, as one dispatcher. A host mounts it with a single
 * catch-all route at /api/nutrilabel/[...path] and exports these handlers:
 *
 *   export { GET, POST, PUT, PATCH, DELETE } from 'nutrilabel/api'
 *
 * Every call runs as the host's current user; refusals (NutrilabelError)
 * become their HTTP status, anything else a 500.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { nutrilabelHost } from './host'
import { cnfFood, searchCnf } from './lib/cnf'
import {
  createIngredient, createProduct, deleteIngredient, deleteProduct, duplicateProduct, getSettings, importHostRecipe,
  listHostRecipes, listIngredients, listProducts, NutrilabelError, saveSettings, updateIngredient, updateProduct,
} from './lib/store'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Ctx = { uid: string; req: NextRequest; p: Record<string, string>; body: () => Promise<Record<string, unknown>> }
type Handler = (c: Ctx) => Promise<Response | object>

const routes: [Method, string, Handler][] = [
  ['GET', 'state', async ({ uid }) => nutrilabelPageData(uid)],

  ['POST', 'ingredients', async ({ uid, body }) => createIngredient(uid, await body())],
  ['PATCH', 'ingredients/:id', async ({ uid, p, body }) => updateIngredient(uid, p.id, await body())],
  ['DELETE', 'ingredients/:id', async ({ uid, p }) => deleteIngredient(uid, p.id)],

  // The Canadian Nutrient File: search it, or copy one food into your ingredients.
  ['GET', 'cnf', async ({ req }) => ({ foods: await searchCnf(req.nextUrl.searchParams.get('q') ?? '') })],
  ['POST', 'cnf/:code', async ({ uid, p, body }) => {
    const food = await cnfFood(Number(p.code))
    if (!food) throw new NutrilabelError('No such food in the Canadian Nutrient File', 404)
    const b = await body()
    return createIngredient(uid, {
      name: String(b.name ?? '').trim() || food.en,
      // CNF names run general to specific ("Sweets, sugars, granulated"); the note asks you to shorten them.
      labelEn: food.en.toLowerCase(),
      labelFr: food.fr.toLowerCase(),
      source: 'CNF', printed: '100 g', servingAmount: 100, servingUnit: 'g',
      nutrients: food.per100,
      notes: `Canadian Nutrient File ${food.code}: ${food.en} (${food.group}). Per 100 g. Check the label names, and set its allergens.`,
    }, food.code)
  }],

  ['POST', 'products', async ({ uid, body }) => createProduct(uid, await body())],
  ['PATCH', 'products/:id', async ({ uid, p, body }) => updateProduct(uid, p.id, await body())],
  ['DELETE', 'products/:id', async ({ uid, p }) => deleteProduct(uid, p.id)],
  ['POST', 'products/:id/duplicate', async ({ uid, p }) => duplicateProduct(uid, p.id)],

  ['GET', 'settings', async ({ uid }) => getSettings(uid)],
  ['PUT', 'settings', async ({ uid, body }) => saveSettings(uid, await body())],

  // Recipes the host keeps (janki: the Kitchen), to start a product from.
  ['GET', 'recipes', async ({ uid }) => listHostRecipes(uid)],
  ['POST', 'recipes/:id/import', async ({ uid, p }) => importHostRecipe(uid, p.id)],
]

/** Everything the NutriLabel page starts with, for one user. */
export async function nutrilabelPageData(uid: string) {
  const [initialIngredients, initialProducts, initialSettings, recipes] = await Promise.all([
    listIngredients(uid), listProducts(uid), getSettings(uid), listHostRecipes(uid),
  ])
  return { initialIngredients, initialProducts, initialSettings, recipeSource: recipes.label }
}

/** Matches 'products/:id/duplicate' against ['products', 'abc', 'duplicate']. */
function match(pattern: string, parts: string[]): Record<string, string> | null {
  const want = pattern.split('/')
  if (want.length !== parts.length) return null
  const p: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) p[want[i].slice(1)] = parts[i]
    else if (want[i] !== parts[i]) return null
  }
  return p
}

type RouteParams = { params: Promise<{ path?: string[] }> }

function handler(method: Method) {
  return async (req: NextRequest, { params }: RouteParams): Promise<Response> => {
    const parts = ((await params).path ?? []).map(decodeURIComponent)
    let found: { run: Handler; p: Record<string, string> } | null = null
    let pathKnown = false
    for (const [m, pattern, run] of routes) {
      const p = match(pattern, parts)
      if (!p) continue
      pathKnown = true
      if (m === method) {
        found = { run, p }
        break
      }
    }
    if (!found) return NextResponse.json({ error: pathKnown ? 'Method not allowed' : 'Not found' }, { status: pathKnown ? 405 : 404 })

    const uid = await nutrilabelHost().userId()
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const body = async () => {
        const json = await req.json().catch(() => ({}))
        return json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
      }
      const result = await found.run({ uid, req, p: found.p, body })
      return result instanceof Response ? result : NextResponse.json(result)
    } catch (err) {
      if (err instanceof NutrilabelError) return NextResponse.json({ error: err.message }, { status: err.status })
      console.error('[nutrilabel]', err)
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
    }
  }
}

export const GET = handler('GET')
export const POST = handler('POST')
export const PUT = handler('PUT')
export const PATCH = handler('PATCH')
export const DELETE = handler('DELETE')
