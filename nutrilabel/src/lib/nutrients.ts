/**
 * The 13 core nutrients of a Canadian Nutrition Facts table, the 2022 Daily
 * Values, the priority allergens, and the EU/EEA reference intakes. Pure data,
 * shared by server and browser.
 *
 * Daily Values: Health Canada, Table of Daily Values (2022), adults and
 * children 4+. Allergens: Health Canada's priority food allergens, plus the
 * gluten sources and added sulphites that a "Contains" statement must name.
 */

export const NUTRIENTS = [
  { key: 'cal', en: 'Calories', fr: 'Calories', unit: 'kcal' },
  { key: 'fat', en: 'Fat', fr: 'Lipides', unit: 'g' },
  { key: 'sat', en: 'Saturated', fr: 'saturés', unit: 'g' },
  { key: 'trans', en: 'Trans', fr: 'trans', unit: 'g' },
  { key: 'carb', en: 'Carbohydrate', fr: 'Glucides', unit: 'g' },
  { key: 'fibre', en: 'Fibre', fr: 'Fibres', unit: 'g' },
  { key: 'sugars', en: 'Sugars', fr: 'Sucres', unit: 'g' },
  { key: 'protein', en: 'Protein', fr: 'Protéines', unit: 'g' },
  { key: 'chol', en: 'Cholesterol', fr: 'Cholestérol', unit: 'mg' },
  { key: 'sodium', en: 'Sodium', fr: 'Sodium', unit: 'mg' },
  { key: 'potassium', en: 'Potassium', fr: 'Potassium', unit: 'mg' },
  { key: 'calcium', en: 'Calcium', fr: 'Calcium', unit: 'mg' },
  { key: 'iron', en: 'Iron', fr: 'Fer', unit: 'mg' },
] as const

export type NutrientKey = (typeof NUTRIENTS)[number]['key']
export const NUTRIENT_KEYS: NutrientKey[] = NUTRIENTS.map((n) => n.key)

/** Amounts as printed; null = left blank (counted as 0, and warned about). */
export type Nutrients = Record<NutrientKey, number | null>
export type Amounts = Record<NutrientKey, number>

export const blankNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as Nutrients

/** Nutrients with a % Daily Value on the label. `sattrans` is saturated + trans together. */
export const DAILY_VALUES = [
  { key: 'fat', dv: 75, unit: 'g' },
  { key: 'sattrans', dv: 20, unit: 'g' },
  { key: 'fibre', dv: 28, unit: 'g' },
  { key: 'sugars', dv: 100, unit: 'g' },
  { key: 'sodium', dv: 2300, unit: 'mg' },
  { key: 'potassium', dv: 3400, unit: 'mg' },
  { key: 'calcium', dv: 1300, unit: 'mg' },
  { key: 'iron', dv: 18, unit: 'mg' },
] as const

export type DvKey = (typeof DAILY_VALUES)[number]['key']

/**
 * Canada's priority allergens plus the gluten sources and sulphites, and the two
 * the EU/EEA list adds (celery, lupin: `ca: false`, so a Canadian "Contains"
 * leaves them out).
 *
 * `no` is the Norwegian word an EU label emphasises in the ingredient list;
 * `noMatch` are the stems that already name it inside an ingredient's own name
 * ("hvetemel" names wheat), so it is emphasised there instead of added in
 * brackets.
 */
export const ALLERGENS = [
  { key: 'milk', en: 'Milk', fr: 'Lait', no: 'melk', noMatch: ['melk'], ca: true },
  { key: 'egg', en: 'Egg', fr: 'Œuf', no: 'egg', noMatch: ['egg'], ca: true },
  { key: 'wheat', en: 'Wheat', fr: 'Blé', no: 'hvete', noMatch: ['hvete', 'spelt', 'durum', 'khorasan'], ca: true },
  { key: 'triticale', en: 'Triticale', fr: 'Triticale', no: 'rughvete', noMatch: ['rughvete'], ca: true },
  { key: 'barley', en: 'Barley', fr: 'Orge', no: 'bygg', noMatch: ['bygg'], ca: true },
  { key: 'rye', en: 'Rye', fr: 'Seigle', no: 'rug', noMatch: ['rug'], ca: true },
  { key: 'oats', en: 'Oats', fr: 'Avoine', no: 'havre', noMatch: ['havre'], ca: true },
  { key: 'peanut', en: 'Peanut', fr: 'Arachide', no: 'peanøtter', noMatch: ['peanøtt'], ca: true },
  { key: 'tree_nuts', en: 'Tree nuts', fr: 'Noix', no: 'nøtter',
    noMatch: ['nøtt', 'mandel', 'mandl', 'cashew', 'pistasj', 'pekan', 'macadamia'], ca: true },
  { key: 'sesame', en: 'Sesame', fr: 'Sésame', no: 'sesam', noMatch: ['sesam'], ca: true },
  { key: 'soy', en: 'Soy', fr: 'Soja', no: 'soya', noMatch: ['soya', 'soja'], ca: true },
  { key: 'fish', en: 'Fish', fr: 'Poisson', no: 'fisk', noMatch: ['fisk'], ca: true },
  { key: 'crustaceans', en: 'Crustaceans', fr: 'Crustacés', no: 'skalldyr', noMatch: ['skalldyr', 'reke', 'krabbe', 'hummer', 'kreps'], ca: true },
  { key: 'molluscs', en: 'Molluscs', fr: 'Mollusques', no: 'bløtdyr', noMatch: ['bløtdyr', 'blåskjell', 'skjell', 'østers', 'blekksprut'], ca: true },
  { key: 'mustard', en: 'Mustard', fr: 'Moutarde', no: 'sennep', noMatch: ['sennep'], ca: true },
  { key: 'sulphites', en: 'Sulphites', fr: 'Sulfites', no: 'sulfitter', noMatch: ['sulfitt', 'svoveldioksid'], ca: true },
  { key: 'celery', en: 'Celery', fr: 'Céleri', no: 'selleri', noMatch: ['selleri'], ca: false },
  { key: 'lupin', en: 'Lupin', fr: 'Lupin', no: 'lupin', noMatch: ['lupin'], ca: false },
] as const

export type AllergenKey = (typeof ALLERGENS)[number]['key']
export const ALLERGEN_KEYS = new Set<string>(ALLERGENS.map((a) => a.key))

/**
 * EU/EEA reference intakes for an average adult (Regulation (EU) 1169/2011,
 * Annex XIII part B), used for %RI on an EU or Norwegian label. Fibre has none.
 */
export const REFERENCE_INTAKES = { kj: 8400, kcal: 2000, fat: 70, sat: 20, carb: 260, sugars: 90, protein: 50, salt: 6 } as const
export type RiKey = keyof typeof REFERENCE_INTAKES
