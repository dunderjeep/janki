/**
 * The engine against the NutriLabel CA workbook (v0.4, recalculated in
 * LibreOffice): same inputs, same declared amounts and % DV.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cfiaRound, computeFacts, roundStep, type Ingredient, type Product } from '../src/lib/engine'
import { computeEu, emphasise, euAmounts, euRound } from '../src/lib/eu'
import { DAILY_VALUES, NUTRIENT_KEYS } from '../src/lib/nutrients'
import { REFERENCE_AMOUNTS } from '../src/lib/ra'

test('halves round up, without float noise', () => {
  assert.equal(roundStep(0.15, 0.1), 0.2)
  assert.equal(roundStep(984.5, 1), 985)
  assert.equal(roundStep(2.25, 0.5), 2.5)
  assert.equal(roundStep(0.375, 0.25), 0.5)
})

test('CFIA steps at their edges', () => {
  const d = (k: Parameters<typeof cfiaRound>[0], x: number) => cfiaRound(k, x).declared
  assert.equal(d('cal', 4.4), 4)
  assert.equal(d('cal', 50), 50)
  assert.equal(d('cal', 52), 50)
  assert.equal(d('cal', 55), 60)
  assert.equal(d('fat', 0.44), 0.4)
  assert.equal(d('fat', 5), 5)
  assert.equal(d('fat', 5.4), 5)
  assert.equal(d('carb', 0.49), 0)
  assert.equal(d('sugars', 0.5), 1)
  assert.equal(d('sodium', 140), 140)
  assert.equal(d('sodium', 142), 140)
  assert.equal(d('sodium', 146), 150)
  assert.equal(d('potassium', 4.9), 0)
  assert.equal(d('calcium', 249), 250)
  assert.equal(d('iron', 0.04), 0)
  assert.equal(d('iron', 1.1), 1)
  assert.equal(d('iron', 1.13), 1.25)
})

const N = (v: (number | null)[]) => Object.fromEntries(NUTRIENT_KEYS.map((k, i) => [k, v[i]])) as Ingredient['nutrients']
const ing = (name: string, labelEn: string, amount: number, unit: 'g' | 'mL', v: (number | null)[]): Ingredient => ({
  id: name, name, labelEn, labelFr: '', labelNo: '', labelFormat: 'CA', source: 'Label', printed: '', servingAmount: amount, servingUnit: unit,
  gPerMl: unit === 'mL' ? 1 : null, nutrients: N(v), allergens: name.includes('Milk') || name.includes('Cream') ? ['milk'] : [], notes: '',
})

const INGREDIENTS = [
  ing('Milk 2%', 'partly skimmed milk', 250, 'mL', [130, 5, 3, 0.1, 12, 0, 12, 9, 20, 120, 400, 350, 0]),
  ing('Cream 35%', 'cream', 15, 'mL', [45, 5, 3, 0.1, 1, 0, 0, 0.3, 10, 4, 10, 10, 0]),
  ing('Sucrose', 'sugar', 4, 'g', [15, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0]),
  ing('Powdered Skim Milk', 'skim milk powder', 25, 'g', [90, 0, 0, 0, 13, 0, 13, 9, 5, 105, 450, 300, 0.1]),
  ing('Dextrose', 'dextrose', 4, 'g', [15, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0]),
  ing('Fructose', 'fructose', 4, 'g', [15, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0]),
  ing('Guar Gum', 'guar gum', 10, 'g', [20, 0, 0, 0, 8, 8, 8, 1, 0, 0, 0, 0, 0]),
  ing('Locust Bean Gum', 'locust bean gum', 10, 'g', [0, 0, 0, 0, 8, 8, 4, 0, 0, 0, 0, 0, 0]),
  ing('Salt', 'salt', 0.7, 'g', [0, 0, 0, 0, 0, 0, 0, 0, 0, 280, 0, 0, 0]),
]

const recipe: [string, number][] = [['Sucrose', 540], ['Milk 2%', 2100], ['Cream 35%', 1052], ['Powdered Skim Milk', 270],
  ['Dextrose', 80], ['Fructose', 80], ['Guar Gum', 4], ['Locust Bean Gum', 4], ['Salt', 2]]

const product: Product = {
  id: 'p', name: 'Fior di latte', nameEn: 'Fior di latte gelato', nameFr: '', price: '', netQuantity: '500 mL', raItem: 'E.1',
  hmEn: '3/4 cup', hmFr: '3/4 tasse', mm: 188, mmUnit: 'mL', servingWeightG: 100, batchWeightG: null,
  containsEn: '', containsFr: '', storageEn: '', storageFr: '', preparedBy: '', ingredientsEn: '', ingredientsFr: '', notes: '',
  nameNo: 'Fior di latte', hmNo: '', storageNo: '', durabilityNo: '', allergyNoteNo: '', ingredientsNo: '', euPortion: false,
  lines: recipe.map(([ingredientId, grams]) => ({ ingredientId, grams })),
}

test('Fior di latte matches the workbook', () => {
  const f = computeFacts(product, new Map(INGREDIENTS.map((i) => [i.id, i])), REFERENCE_AMOUNTS)
  assert.deepEqual(NUTRIENT_KEYS.map((k) => f.declared![k].declared), [190, 10, 6, 0.2, 25, 0, 23, 5, 20, 80, 225, 175, 0])
  assert.deepEqual(DAILY_VALUES.map((d) => f.dv![d.key]), [13, 31, 0, 23, 3, 7, 13, 0])
  // Heaviest first, whatever order the recipe was typed in.
  assert.equal(f.ingredientsEn, 'partly skimmed milk, cream, sugar, skim milk powder, dextrose, fructose, guar gum, locust bean gum, salt')
  assert.equal(f.containsEn, 'Milk')
  assert.equal(f.containsFr, 'Lait')
  assert.deepEqual(f.warnings, [])
})

test('a mL serving with no weight declares nothing and says why', () => {
  const f = computeFacts({ ...product, servingWeightG: null }, new Map(INGREDIENTS.map((i) => [i.id, i])), REFERENCE_AMOUNTS)
  assert.equal(f.declared, null)
  assert.match(f.warnings.join(' '), /weighs in grams/)
})

// ------------------------------------------------------------------ Norway / EU

test('EU rounding at its edges, in Norwegian decimals', () => {
  const t = (k: Parameters<typeof euRound>[0], x: number) => euRound(k, x).text
  assert.equal(t('fat', 0), '0')
  assert.equal(t('fat', 0.5), '<0,5')
  assert.equal(t('fat', 0.51), '0,5')
  assert.equal(t('fat', 9.94), '9,9')
  assert.equal(t('fat', 10), '10')
  assert.equal(t('fat', 10.5), '11')
  assert.equal(t('sat', 0.1), '<0,1')
  assert.equal(t('sat', 0.15), '0,2')
  assert.equal(t('salt', 0.0125), '<0,01')
  assert.equal(t('salt', 0.013), '0,01')
  assert.equal(t('salt', 0.255), '0,26')
  assert.equal(t('salt', 1.04), '1,0')
  assert.equal(t('kj', 1650.5), '1651')
})

test('EU amounts: carbohydrate without fibre, salt from sodium, energy from the factors', () => {
  const e = euAmounts({ fat: 10, sat: 6, carb: 20, sugars: 8, fibre: 5, protein: 3, sodium: 400 })
  assert.equal(e.carb, 15)
  assert.equal(e.salt, 1)
  assert.equal(e.kj, 37 * 10 + 17 * 15 + 17 * 3 + 8 * 5)
  assert.equal(e.kcal, 9 * 10 + 4 * 15 + 4 * 3 + 2 * 5)
})

test('allergens are emphasised in the name, or added in brackets', () => {
  assert.equal(emphasise('hvetemel', ['wheat']), '*hvete*mel')
  assert.equal(emphasise('Hvetemel', ['wheat']), '*Hvete*mel')
  assert.equal(emphasise('mozzarella', ['milk']), 'mozzarella (*melk*)')
  assert.equal(emphasise('*fløte*', ['milk']), '*fløte*')
  assert.equal(emphasise('sukker', []), 'sukker')
  assert.equal(emphasise('eggepasta', ['egg', 'wheat']), '*egg*epasta (*hvete*)')
})

test('Fior di latte as a Norwegian label: per 100 ml, the same nutrients', () => {
  const byId = new Map(INGREDIENTS.map((i) => [i.id, i]))
  const ca = computeFacts(product, byId, REFERENCE_AMOUNTS)
  const eu = computeEu({ ...product, euPortion: true }, byId)
  assert.equal(eu.basis, 'ml')
  const density = 100 / 188
  const g = ca.per100!
  assert.ok(Math.abs(eu.per100!.salt - (g.sodium * 2.5 / 1000) * density) < 1e-9)
  assert.ok(Math.abs(eu.per100!.carb - (g.carb - g.fibre) * density) < 1e-9)
  // The portion is the 188 mL serving, which weighs 100 g.
  assert.equal(eu.portionAmount, 188)
  assert.ok(Math.abs(eu.colPortion!.fat.raw - g.fat) < 1e-9)
  assert.equal(eu.ri!.fat, Math.round((g.fat / 70) * 100))
  assert.match(eu.ingredients, /^Milk 2% \(\*melk\*\), Cream 35% \(\*melk\*\), Sucrose,/)
  assert.match(eu.warnings.join(' '), /No Norwegian name/)
})
