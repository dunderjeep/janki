/**
 * NutriLabel's tables, in their own `nutrilabel` schema. Every row has an
 * owner, so a multi-user host can share one database; on a desktop the owner
 * is always the one local user.
 *
 * The SQL that creates them is in migrations/ (standalone) and in the host's
 * own migrations (janki: 0032_nutrilabel.sql, 0033_nutrilabel_norway.sql).
 * Change all three together.
 */
import { boolean, integer, jsonb, numeric, pgSchema, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import type { Nutrients } from './lib/nutrients'

export const nutrilabel = pgSchema('nutrilabel')

const stamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const nutrilabelIngredients = nutrilabel.table('ingredients', {
  id: text('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  labelEn: text('label_en').notNull().default(''),
  labelFr: text('label_fr').notNull().default(''),
  labelNo: text('label_no').notNull().default(''),
  /** CA | EU: which kind of label the numbers came from (stored the Canadian way either way). */
  labelFormat: text('label_format').notNull().default('CA'),
  source: text('source').notNull().default('Label'),
  printed: text('printed').notNull().default(''),
  servingAmount: numeric('serving_amount', { mode: 'number' }),
  servingUnit: text('serving_unit').notNull().default('g'),
  gPerMl: numeric('g_per_ml', { mode: 'number' }),
  /** Per serving as printed: { cal, fat, …, iron }, null where blank. */
  nutrients: jsonb('nutrients').$type<Nutrients>().notNull(),
  allergens: text('allergens').array().notNull().default([]),
  notes: text('notes').notNull().default(''),
  /** The Canadian Nutrient File food it was copied from, if any. */
  cnfCode: integer('cnf_code'),
  ...stamps,
}, (t) => [uniqueIndex('nutrilabel_ingredients_name_idx').on(t.ownerUid, t.name)])

export const nutrilabelProducts = nutrilabel.table('products', {
  id: text('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  name: text('name').notNull(),
  nameEn: text('name_en').notNull().default(''),
  nameFr: text('name_fr').notNull().default(''),
  price: text('price').notNull().default(''),
  netQuantity: text('net_quantity').notNull().default(''),
  raItem: text('ra_item').notNull().default(''),
  hmEn: text('hm_en').notNull().default(''),
  hmFr: text('hm_fr').notNull().default(''),
  mm: numeric('mm', { mode: 'number' }),
  mmUnit: text('mm_unit').notNull().default('g'),
  servingWeightG: numeric('serving_weight_g', { mode: 'number' }),
  batchWeightG: numeric('batch_weight_g', { mode: 'number' }),
  containsEn: text('contains_en').notNull().default(''),
  containsFr: text('contains_fr').notNull().default(''),
  storageEn: text('storage_en').notNull().default(''),
  storageFr: text('storage_fr').notNull().default(''),
  preparedBy: text('prepared_by').notNull().default(''),
  ingredientsEn: text('ingredients_en').notNull().default(''),
  ingredientsFr: text('ingredients_fr').notNull().default(''),
  nameNo: text('name_no').notNull().default(''),
  hmNo: text('hm_no').notNull().default(''),
  storageNo: text('storage_no').notNull().default(''),
  durabilityNo: text('durability_no').notNull().default(''),
  allergyNoteNo: text('allergy_note_no').notNull().default(''),
  ingredientsNo: text('ingredients_no').notNull().default(''),
  euPortion: boolean('eu_portion').notNull().default(false),
  notes: text('notes').notNull().default(''),
  /** Where the recipe was imported from, as the host names it (janki: "kitchen:<recipe id>"). */
  sourceRef: text('source_ref'),
  ...stamps,
}, (t) => [uniqueIndex('nutrilabel_products_name_idx').on(t.ownerUid, t.name)])

/** A product's recipe: grams of each ingredient in one batch. */
export const nutrilabelLines = nutrilabel.table('product_lines', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => nutrilabelProducts.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  // An ingredient in use can't be deleted: the label would silently change.
  ingredientId: text('ingredient_id').notNull().references(() => nutrilabelIngredients.id, { onDelete: 'restrict' }),
  grams: numeric('grams', { mode: 'number' }),
}, (t) => [index('nutrilabel_lines_product_idx').on(t.productId, t.position)])

/** The business named on package labels. */
export const nutrilabelSettings = nutrilabel.table('settings', {
  ownerUid: text('owner_uid').primaryKey(),
  businessName: text('business_name').notNull().default(''),
  address: text('address').notNull().default(''),
  contact: text('contact').notNull().default(''),
  /** CA | NO: which label the app opens on. */
  market: text('market').notNull().default('CA'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
