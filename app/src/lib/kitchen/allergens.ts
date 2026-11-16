/**
 * The 14 allergens EU/EEA food law says must be declared (Norway follows the
 * same list). Keys are stored on each ingredient; labels are for the page.
 */
export const ALLERGENS = [
  { key: 'gluten', en: 'Gluten (cereals)', no: 'Gluten' },
  { key: 'crustaceans', en: 'Crustaceans', no: 'Skalldyr' },
  { key: 'egg', en: 'Egg', no: 'Egg' },
  { key: 'fish', en: 'Fish', no: 'Fisk' },
  { key: 'peanuts', en: 'Peanuts', no: 'Peanøtter' },
  { key: 'soy', en: 'Soy', no: 'Soya' },
  { key: 'milk', en: 'Milk', no: 'Melk' },
  { key: 'nuts', en: 'Tree nuts', no: 'Nøtter' },
  { key: 'celery', en: 'Celery', no: 'Selleri' },
  { key: 'mustard', en: 'Mustard', no: 'Sennep' },
  { key: 'sesame', en: 'Sesame', no: 'Sesamfrø' },
  { key: 'sulphites', en: 'Sulphites', no: 'Svoveldioksid og sulfitter' },
  { key: 'lupin', en: 'Lupin', no: 'Lupin' },
  { key: 'molluscs', en: 'Molluscs', no: 'Bløtdyr' },
] as const

export type AllergenKey = (typeof ALLERGENS)[number]['key']

export const ALLERGEN_KEYS = new Set<string>(ALLERGENS.map((a) => a.key))
