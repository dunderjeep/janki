/**
 * janki as NutriLabel's host: janki's Postgres, its signed-in user, and the
 * Kitchen's recipes (kitchen.recipes, kept under Dough fronts) to start a
 * product from. Imported for its side effect by the NutriLabel page and API.
 */
import { sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { setNutrilabelHost, NutrilabelError, type HostRecipe } from 'nutrilabel/server'
import type { AllergenKey } from 'nutrilabel/engine'

/** The Kitchen keeps the EU-14 keys. All but gluten have a NutriLabel twin; gluten needs its grain named. */
const EU_TO_CA: Record<string, AllergenKey> = {
  milk: 'milk', egg: 'egg', peanuts: 'peanut', nuts: 'tree_nuts', soy: 'soy', fish: 'fish', crustaceans: 'crustaceans',
  molluscs: 'molluscs', mustard: 'mustard', sesame: 'sesame', sulphites: 'sulphites', celery: 'celery', lupin: 'lupin',
}

const GRAMS: Record<string, number> = { g: 1, gram: 1, grams: 1, gr: 1, kg: 1000 }

setNutrilabelHost({
  db,
  userId: async () => (await auth())?.user?.id ?? null,
  recipes: {
    label: 'Kitchen',
    list: async (uid) => {
      const { rows } = await db.execute<{ id: string; title: string; n: number }>(sql`
        select r.id, r.title,
               (select count(*)::int from kitchen.recipe_ingredients i where i.recipe_id = r.id) as n
          from kitchen.recipes r where r.owner_uid = ${uid} order by r.title`)
      return rows.map((r) => ({ id: r.id, title: r.title, detail: `${r.n} ingredient${r.n === 1 ? '' : 's'}` }))
    },
    get: async (uid, id): Promise<HostRecipe> => {
      const { rows: [recipe] } = await db.execute<{ title: string }>(sql`
        select title from kitchen.recipes where id = ${id} and owner_uid = ${uid}`)
      if (!recipe) throw new NutrilabelError('Not found', 404)
      const { rows } = await db.execute<{ name: string; quantity: number | null; unit: string; allergens: string[] }>(sql`
        select name, quantity::float8 as quantity, unit, allergens
          from kitchen.recipe_ingredients where recipe_id = ${id} order by position`)
      return {
        ref: `kitchen:${id}`,
        title: recipe.title,
        lines: rows.map((r) => {
          const factor = GRAMS[r.unit.trim().toLowerCase()]
          const allergens = r.allergens.map((a) => EU_TO_CA[a]).filter(Boolean)
          const notes = [
            r.quantity == null ? 'no amount in the Kitchen' : factor ? '' : `was ${r.quantity} ${r.unit || '(no unit)'} in the Kitchen; enter grams`,
            r.allergens.includes('gluten') ? 'marked gluten: say which grain (wheat, barley, rye, oats)' : '',
          ].filter(Boolean)
          return {
            name: r.name,
            grams: r.quantity != null && factor ? r.quantity * factor : null,
            note: notes.join('; ') || undefined,
            allergens,
          }
        }),
      }
    },
  },
})
