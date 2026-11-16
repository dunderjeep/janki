/**
 * Recipes, with ingredients that carry their allergens and cost. They live in
 * their own `kitchen` schema rather than under Dough, so NutriLabel can later
 * add nutrition per ingredient and print labels from the same rows.
 */
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/db'
import { ChainError } from '@/lib/chains/store'
import { ALLERGEN_KEYS } from './allergens'

export type Ingredient = {
  name: string
  quantity: number | null
  unit: string
  allergens: string[]
  costNok: number | null
}

export type Recipe = {
  id: string
  frontId: string | null
  title: string
  yieldQty: number | null
  yieldUnit: string
  method: string
  notes: string
  updatedAt: string
  ingredients: Ingredient[]
}

export type RecipeSummary = Pick<Recipe, 'id' | 'title' | 'yieldQty' | 'yieldUnit' | 'updatedAt'> & {
  allergens: string[]
  costNok: number | null
}

const text = (v: unknown, max: number, name: string) => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (t.length > max) throw new ChainError(`${name} is too long`)
  return t
}

const num = (v: unknown, name: string): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new ChainError(`${name} must be a number of 0 or more`)
  return n
}

function parse(input: Record<string, unknown>) {
  const title = text(input.title, 120, 'The title')
  if (!title) throw new ChainError('Give the recipe a title')
  const rows = Array.isArray(input.ingredients) ? input.ingredients : []
  if (rows.length > 100) throw new ChainError('Keep it under 100 ingredients')
  const ingredients: Ingredient[] = rows
    .map((r) => (typeof r === 'object' && r !== null ? (r as Record<string, unknown>) : {}))
    .filter((r) => text(r.name, 120, 'An ingredient name'))
    .map((r) => {
      const name = text(r.name, 120, 'An ingredient name')
      const allergens = Array.isArray(r.allergens) ? [...new Set(r.allergens.map(String))] : []
      const bad = allergens.find((a) => !ALLERGEN_KEYS.has(a))
      if (bad) throw new ChainError(`Unknown allergen: ${bad}`)
      return {
        name,
        quantity: num(r.quantity, `The amount of ${name}`),
        unit: text(r.unit, 20, `The unit of ${name}`),
        allergens,
        costNok: num(r.costNok, `The cost of ${name}`),
      }
    })
  return {
    title,
    yieldQty: num(input.yieldQty, 'The yield'),
    yieldUnit: text(input.yieldUnit, 30, 'The yield unit'),
    method: text(input.method, 20000, 'The method'),
    notes: text(input.notes, 5000, 'The notes'),
    ingredients,
  }
}

export async function listRecipes(uid: string, front: string | null): Promise<RecipeSummary[]> {
  const { rows } = await db.execute<RecipeSummary>(sql`
    select r.id, r.title, r.yield_qty::float8 as "yieldQty", r.yield_unit as "yieldUnit",
           to_char(r.updated_at at time zone 'Europe/Oslo', 'YYYY-MM-DD') as "updatedAt",
           coalesce((select array_agg(distinct a order by a) from kitchen.recipe_ingredients i, unnest(i.allergens) a
                      where i.recipe_id = r.id), '{}') as allergens,
           (select sum(cost_nok)::float8 from kitchen.recipe_ingredients i where i.recipe_id = r.id) as "costNok"
      from kitchen.recipes r
     where r.owner_uid = ${uid} and (${front}::text is null or r.front_id = ${front})
     order by r.title`)
  return rows
}

export async function getRecipe(uid: string, id: string): Promise<Recipe> {
  const { rows } = await db.execute<Omit<Recipe, 'ingredients'>>(sql`
    select id, front_id as "frontId", title, yield_qty::float8 as "yieldQty", yield_unit as "yieldUnit", method, notes,
           to_char(updated_at at time zone 'Europe/Oslo', 'YYYY-MM-DD') as "updatedAt"
      from kitchen.recipes where id = ${id} and owner_uid = ${uid}`)
  if (!rows[0]) throw new ChainError('Not found', 404)
  const { rows: ingredients } = await db.execute<Ingredient>(sql`
    select name, quantity::float8 as quantity, unit, allergens, cost_nok::float8 as "costNok"
      from kitchen.recipe_ingredients where recipe_id = ${id} order by position`)
  return { ...rows[0], ingredients }
}

async function writeIngredients(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string, ingredients: Ingredient[]) {
  await tx.execute(sql`delete from kitchen.recipe_ingredients where recipe_id = ${id}`)
  for (const [i, ing] of ingredients.entries()) {
    await tx.execute(sql`
      insert into kitchen.recipe_ingredients (id, recipe_id, position, name, quantity, unit, allergens, cost_nok)
      values (${nanoid()}, ${id}, ${i}, ${ing.name}, ${ing.quantity}, ${ing.unit},
              ${sql.raw(`'{${ing.allergens.join(',')}}'`)}::text[], ${ing.costNok})`)
  }
}

export async function createRecipe(uid: string, front: string | null, input: Record<string, unknown>): Promise<Recipe> {
  const r = parse(input)
  const id = nanoid()
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into kitchen.recipes (id, owner_uid, front_id, title, yield_qty, yield_unit, method, notes)
      values (${id}, ${uid}, ${front}, ${r.title}, ${r.yieldQty}, ${r.yieldUnit}, ${r.method}, ${r.notes})`)
    await writeIngredients(tx, id, r.ingredients)
  })
  return getRecipe(uid, id)
}

export async function updateRecipe(uid: string, id: string, input: Record<string, unknown>): Promise<Recipe> {
  const r = parse(input)
  await db.transaction(async (tx) => {
    const { rowCount } = await tx.execute(sql`
      update kitchen.recipes
         set title = ${r.title}, yield_qty = ${r.yieldQty}, yield_unit = ${r.yieldUnit},
             method = ${r.method}, notes = ${r.notes}, updated_at = now()
       where id = ${id} and owner_uid = ${uid}`)
    if (!rowCount) throw new ChainError('Not found', 404)
    await writeIngredients(tx, id, r.ingredients)
  })
  return getRecipe(uid, id)
}

export async function deleteRecipe(uid: string, id: string) {
  const { rowCount } = await db.execute(sql`delete from kitchen.recipes where id = ${id} and owner_uid = ${uid}`)
  if (!rowCount) throw new ChainError('Not found', 404)
  return { ok: true }
}
