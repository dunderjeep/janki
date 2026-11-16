/**
 * Reading and writing ingredients, products and settings, for one owner.
 * Every function takes the owner's id first and never touches anyone else's rows.
 */
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, nutrilabelHost } from '../host'
import { nutrilabelIngredients as I, nutrilabelLines as L, nutrilabelProducts as P, nutrilabelSettings as S } from '../schema'
import type { Ingredient, LabelFormat, Line, Product, Unit } from './engine'
import { ALLERGEN_KEYS, NUTRIENT_KEYS, blankNutrients, type AllergenKey, type Nutrients } from './nutrients'

export class NutrilabelError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export type Market = 'CA' | 'NO'
export type Settings = { businessName: string; address: string; contact: string; market: Market }

// ------------------------------------------------------------------ parsing

type Input = Record<string, unknown>

const text = (v: unknown, max: number, what: string) => {
  const t = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  if (t.length > max) throw new NutrilabelError(`${what} is too long (at most ${max} characters)`)
  return t
}

const num = (v: unknown, what: string): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new NutrilabelError(`${what} must be a number of 0 or more`)
  if (n > 1e7) throw new NutrilabelError(`${what} is too large`)
  return n
}

const unit = (v: unknown): Unit => (v === 'mL' ? 'mL' : 'g')
const labelFormat = (v: unknown): LabelFormat => (v === 'EU' ? 'EU' : 'CA')
const market = (v: unknown): Market => (v === 'NO' ? 'NO' : 'CA')

function parseIngredient(b: Input) {
  const name = text(b.name, 120, 'The name')
  if (!name) throw new NutrilabelError('Give the ingredient a name')
  const raw = (typeof b.nutrients === 'object' && b.nutrients) || {}
  const nutrients = blankNutrients()
  for (const k of NUTRIENT_KEYS) nutrients[k] = num((raw as Input)[k], `The amount of ${k}`)
  const allergens = Array.isArray(b.allergens) ? [...new Set(b.allergens.map(String))] : []
  const bad = allergens.find((a) => !ALLERGEN_KEYS.has(a))
  if (bad) throw new NutrilabelError(`Unknown allergen: ${bad}`)
  return {
    name,
    labelEn: text(b.labelEn, 2000, 'The English label name'),
    labelFr: text(b.labelFr, 2000, 'The French label name'),
    labelNo: text(b.labelNo, 2000, 'The Norwegian label name'),
    labelFormat: labelFormat(b.labelFormat),
    source: text(b.source, 20, 'The source') || 'Label',
    printed: text(b.printed, 120, 'The serving as printed'),
    servingAmount: num(b.servingAmount, 'The serving amount'),
    servingUnit: unit(b.servingUnit),
    gPerMl: num(b.gPerMl, 'Grams per mL'),
    nutrients,
    allergens: allergens as AllergenKey[],
    notes: text(b.notes, 5000, 'The notes'),
  }
}

function parseProduct(b: Input) {
  const name = text(b.name, 120, 'The name')
  if (!name) throw new NutrilabelError('Give the product a name')
  const t = (k: string, max: number, what: string) => text(b[k], max, what)
  const rows = Array.isArray(b.lines) ? b.lines : []
  if (rows.length > 200) throw new NutrilabelError('Keep a recipe under 200 lines')
  const lines: Line[] = rows.map((r) => {
    const o = (typeof r === 'object' && r ? r : {}) as Input
    return { ingredientId: String(o.ingredientId ?? ''), grams: num(o.grams, 'A recipe amount') }
  }).filter((l) => l.ingredientId)
  return {
    name,
    nameEn: t('nameEn', 200, 'The English name'),
    nameFr: t('nameFr', 200, 'The French name'),
    price: t('price', 40, 'The price'),
    netQuantity: t('netQuantity', 60, 'The net quantity'),
    raItem: t('raItem', 10, 'The RA item'),
    hmEn: t('hmEn', 80, 'The household measure'),
    hmFr: t('hmFr', 80, 'The French household measure'),
    mm: num(b.mm, 'The metric serving'),
    mmUnit: unit(b.mmUnit),
    servingWeightG: num(b.servingWeightG, 'The serving weight'),
    batchWeightG: num(b.batchWeightG, 'The batch weight'),
    containsEn: t('containsEn', 500, '"Contains"'),
    containsFr: t('containsFr', 500, '"Contient"'),
    storageEn: t('storageEn', 120, 'The storage line'),
    storageFr: t('storageFr', 120, 'The French storage line'),
    preparedBy: t('preparedBy', 300, '"Prepared by"'),
    ingredientsEn: t('ingredientsEn', 5000, 'The English ingredient list'),
    ingredientsFr: t('ingredientsFr', 5000, 'The French ingredient list'),
    nameNo: t('nameNo', 200, 'The Norwegian name'),
    hmNo: t('hmNo', 80, 'The portion description'),
    storageNo: t('storageNo', 160, 'The Norwegian storage line'),
    durabilityNo: t('durabilityNo', 160, 'The date line'),
    allergyNoteNo: t('allergyNoteNo', 300, 'The allergy note'),
    ingredientsNo: t('ingredientsNo', 5000, 'The Norwegian ingredient list'),
    euPortion: b.euPortion === true,
    notes: t('notes', 5000, 'The notes'),
    lines,
  }
}

// ------------------------------------------------------------------ reading

type IRow = typeof I.$inferSelect
type PRow = typeof P.$inferSelect

const toIngredient = (r: IRow): Ingredient => ({
  id: r.id, name: r.name, labelEn: r.labelEn, labelFr: r.labelFr, labelNo: r.labelNo,
  labelFormat: labelFormat(r.labelFormat), source: r.source, printed: r.printed,
  servingAmount: r.servingAmount, servingUnit: unit(r.servingUnit), gPerMl: r.gPerMl,
  nutrients: { ...blankNutrients(), ...(r.nutrients as Nutrients) },
  allergens: r.allergens as AllergenKey[], notes: r.notes,
})

const toProduct = (r: PRow, lines: Line[]): Product => ({
  id: r.id, name: r.name, nameEn: r.nameEn, nameFr: r.nameFr, price: r.price, netQuantity: r.netQuantity,
  raItem: r.raItem, hmEn: r.hmEn, hmFr: r.hmFr, mm: r.mm, mmUnit: unit(r.mmUnit),
  servingWeightG: r.servingWeightG, batchWeightG: r.batchWeightG,
  containsEn: r.containsEn, containsFr: r.containsFr, storageEn: r.storageEn, storageFr: r.storageFr,
  preparedBy: r.preparedBy, ingredientsEn: r.ingredientsEn, ingredientsFr: r.ingredientsFr,
  nameNo: r.nameNo, hmNo: r.hmNo, storageNo: r.storageNo, durabilityNo: r.durabilityNo,
  allergyNoteNo: r.allergyNoteNo, ingredientsNo: r.ingredientsNo, euPortion: r.euPortion, notes: r.notes,
  lines,
})

export async function listIngredients(uid: string): Promise<Ingredient[]> {
  const rows = await db.select().from(I).where(eq(I.ownerUid, uid)).orderBy(asc(I.name))
  return rows.map(toIngredient)
}

export async function listProducts(uid: string): Promise<Product[]> {
  const rows = await db.select().from(P).where(eq(P.ownerUid, uid)).orderBy(asc(P.name))
  if (!rows.length) return []
  const lines = await db.select().from(L).where(inArray(L.productId, rows.map((r) => r.id))).orderBy(asc(L.position))
  return rows.map((r) => toProduct(r, lines.filter((l) => l.productId === r.id).map((l) => ({ ingredientId: l.ingredientId, grams: l.grams }))))
}

async function getProduct(uid: string, id: string): Promise<Product> {
  const [row] = await db.select().from(P).where(and(eq(P.id, id), eq(P.ownerUid, uid)))
  if (!row) throw new NutrilabelError('Not found', 404)
  const lines = await db.select().from(L).where(eq(L.productId, id)).orderBy(asc(L.position))
  return toProduct(row, lines.map((l) => ({ ingredientId: l.ingredientId, grams: l.grams })))
}

export async function getSettings(uid: string): Promise<Settings> {
  const [row] = await db.select().from(S).where(eq(S.ownerUid, uid))
  return { businessName: row?.businessName ?? '', address: row?.address ?? '', contact: row?.contact ?? '', market: market(row?.market) }
}

// ------------------------------------------------------------------ ingredients

async function ingredientNameTaken(uid: string, name: string, except?: string) {
  const rows = await db.select({ id: I.id, name: I.name }).from(I)
    .where(and(eq(I.ownerUid, uid), except ? ne(I.id, except) : undefined))
  return rows.some((r) => r.name.toLowerCase() === name.toLowerCase())
}

export async function createIngredient(uid: string, b: Input, cnfCode: number | null = null): Promise<Ingredient> {
  const v = parseIngredient(b)
  if (await ingredientNameTaken(uid, v.name)) throw new NutrilabelError(`There is already an ingredient called "${v.name}"`)
  const [row] = await db.insert(I).values({ id: nanoid(), ownerUid: uid, ...v, cnfCode }).returning()
  return toIngredient(row)
}

export async function updateIngredient(uid: string, id: string, b: Input): Promise<Ingredient> {
  const v = parseIngredient(b)
  if (await ingredientNameTaken(uid, v.name, id)) throw new NutrilabelError(`There is already an ingredient called "${v.name}"`)
  const [row] = await db.update(I).set({ ...v, updatedAt: new Date() }).where(and(eq(I.id, id), eq(I.ownerUid, uid))).returning()
  if (!row) throw new NutrilabelError('Not found', 404)
  return toIngredient(row)
}

export async function deleteIngredient(uid: string, id: string) {
  const users = await db.selectDistinct({ name: P.name }).from(L).innerJoin(P, eq(P.id, L.productId))
    .where(and(eq(L.ingredientId, id), eq(P.ownerUid, uid)))
  if (users.length) throw new NutrilabelError(`It is in the recipe of ${users.map((u) => u.name).join(', ')}. Take it out there first.`, 409)
  const rows = await db.delete(I).where(and(eq(I.id, id), eq(I.ownerUid, uid))).returning({ id: I.id })
  if (!rows.length) throw new NutrilabelError('Not found', 404)
  return { ok: true }
}

// ------------------------------------------------------------------ products

async function productNameTaken(uid: string, name: string, except?: string) {
  const rows = await db.select({ name: P.name }).from(P).where(and(eq(P.ownerUid, uid), except ? ne(P.id, except) : undefined))
  return rows.some((r) => r.name.toLowerCase() === name.toLowerCase())
}

async function freeProductName(uid: string, base: string) {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} (${n})`
    if (!(await productNameTaken(uid, name))) return name
  }
}

/** Only this owner's ingredients may go in this owner's recipe. */
async function checkLines(uid: string, lines: Line[]) {
  const ids = [...new Set(lines.map((l) => l.ingredientId))]
  if (!ids.length) return
  const mine = await db.select({ id: I.id }).from(I).where(and(eq(I.ownerUid, uid), inArray(I.id, ids)))
  if (mine.length !== ids.length) throw new NutrilabelError('A recipe line names an ingredient that does not exist')
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function writeLines(tx: Tx, productId: string, lines: Line[]) {
  await tx.delete(L).where(eq(L.productId, productId))
  if (lines.length) {
    await tx.insert(L).values(lines.map((l, position) => ({ id: nanoid(), productId, position, ingredientId: l.ingredientId, grams: l.grams })))
  }
}

export async function createProduct(uid: string, b: Input, sourceRef: string | null = null): Promise<Product> {
  const { lines, ...v } = parseProduct(b)
  if (await productNameTaken(uid, v.name)) throw new NutrilabelError(`There is already a product called "${v.name}"`)
  await checkLines(uid, lines)
  const id = nanoid()
  await db.transaction(async (tx) => {
    await tx.insert(P).values({ id, ownerUid: uid, ...v, sourceRef })
    await writeLines(tx, id, lines)
  })
  return getProduct(uid, id)
}

export async function updateProduct(uid: string, id: string, b: Input): Promise<Product> {
  const { lines, ...v } = parseProduct(b)
  if (await productNameTaken(uid, v.name, id)) throw new NutrilabelError(`There is already a product called "${v.name}"`)
  await checkLines(uid, lines)
  await db.transaction(async (tx) => {
    const rows = await tx.update(P).set({ ...v, updatedAt: new Date() }).where(and(eq(P.id, id), eq(P.ownerUid, uid))).returning({ id: P.id })
    if (!rows.length) throw new NutrilabelError('Not found', 404)
    await writeLines(tx, id, lines)
  })
  return getProduct(uid, id)
}

export async function duplicateProduct(uid: string, id: string): Promise<Product> {
  const p = await getProduct(uid, id)
  return createProduct(uid, { ...p, name: await freeProductName(uid, `${p.name} copy`) })
}

export async function deleteProduct(uid: string, id: string) {
  const rows = await db.delete(P).where(and(eq(P.id, id), eq(P.ownerUid, uid))).returning({ id: P.id })
  if (!rows.length) throw new NutrilabelError('Not found', 404)
  return { ok: true }
}

// ------------------------------------------------------------------ settings

export async function saveSettings(uid: string, b: Input): Promise<Settings> {
  const v = {
    businessName: text(b.businessName, 200, 'The business name'),
    address: text(b.address, 300, 'The address'),
    contact: text(b.contact, 200, 'The contact line'),
    market: market(b.market),
  }
  await db.insert(S).values({ ownerUid: uid, ...v }).onConflictDoUpdate({ target: S.ownerUid, set: { ...v, updatedAt: new Date() } })
  return v
}

// ------------------------------------------------------------------ host recipes

export async function listHostRecipes(uid: string) {
  const src = nutrilabelHost().recipes
  return { label: src?.label ?? null, recipes: src ? await src.list(uid) : [] }
}

/**
 * A product made from one of the host's recipes. Ingredients are matched by
 * name; any the library doesn't have yet are added as blanks, to be filled in
 * from their own labels, so nothing is silently dropped.
 */
export async function importHostRecipe(uid: string, recipeId: string) {
  const src = nutrilabelHost().recipes
  if (!src) throw new NutrilabelError('This app has no recipes to import from', 404)
  const recipe = await src.get(uid, recipeId)
  const library = await listIngredients(uid)
  const find = (name: string) => {
    const n = name.trim().toLowerCase()
    return library.find((i) => i.name.toLowerCase() === n) ?? library.find((i) => i.labelEn.toLowerCase() === n)
  }
  const added: string[] = []
  const lines: Line[] = []
  for (const l of recipe.lines) {
    let ing = find(l.name)
    if (!ing) {
      ing = await createIngredient(uid, {
        name: l.name, labelEn: l.name.toLowerCase(), source: 'Custom', allergens: l.allergens,
        notes: `Added from the recipe "${recipe.title}". Fill in its serving and nutrients from its own label.`,
      })
      library.push(ing)
      added.push(ing.name)
    }
    lines.push({ ingredientId: ing.id, grams: l.grams })
  }
  const notes = recipe.lines.filter((l) => l.note).map((l) => `${l.name}: ${l.note}`)
  const product = await createProduct(uid, {
    name: await freeProductName(uid, recipe.title),
    nameEn: recipe.title,
    notes: notes.length ? `Imported. ${notes.join(' ')}` : 'Imported.',
    lines,
  }, recipe.ref)
  return { product, added, ingredients: await listIngredients(uid) }
}
