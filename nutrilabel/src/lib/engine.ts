/**
 * The label arithmetic, with no database and no React: ingredients as printed
 * on their own labels → per 100 g → a batch from a recipe in grams → one
 * serving → CFIA rounding → % Daily Value → warnings.
 *
 * It is a port of the NutriLabel CA workbook (v0.4), formula for formula, so
 * the spreadsheet and the app can be checked against each other. The rounding
 * steps are CFIA's "Rounding and manner of expression for Nutrition Facts table
 * core information" (FDR B.01.401); halves round up, as Excel's ROUND does.
 *
 * Runs in the browser too, so a label redraws as you type.
 */
import {
  ALLERGENS, DAILY_VALUES, NUTRIENT_KEYS,
  type AllergenKey, type Amounts, type DvKey, type NutrientKey, type Nutrients,
} from './nutrients'

// ------------------------------------------------------------------ types

export type Unit = 'g' | 'mL'
/** Which kind of label an ingredient's numbers were copied from. */
export type LabelFormat = 'CA' | 'EU'

export type Ingredient = {
  id: string
  /** Unique name, your own. */
  name: string
  /** As it should read in your product's ingredient list. */
  labelEn: string
  labelFr: string
  /** Norwegian. Mark the allergen with *stars* ("*hvete*mel") to choose what is emphasised. */
  labelNo: string
  /**
   * CA: copied from a Canadian table. EU: from an EU/Norwegian one, whose
   * carbohydrate leaves fibre out and which gives salt, not sodium. The
   * nutrients are stored the Canadian way either way (carbohydrate with fibre,
   * sodium in mg); the editor converts.
   */
  labelFormat: LabelFormat
  /** Label | CNF | USDA | Lab | Custom */
  source: string
  /** The serving line as printed, e.g. "1/8 tsp (0.7 g)". For your notes only. */
  printed: string
  servingAmount: number | null
  servingUnit: Unit
  /** Grams per mL, needed when the serving is printed in mL. */
  gPerMl: number | null
  /** Per serving as printed. */
  nutrients: Nutrients
  allergens: AllergenKey[]
  notes: string
}

export type Line = { ingredientId: string; grams: number | null }

export type Product = {
  id: string
  name: string
  nameEn: string
  nameFr: string
  price: string
  netQuantity: string
  /** Item number in Health Canada's Table of Reference Amounts, e.g. "E.1". */
  raItem: string
  /** Household measure, e.g. "3/4 cup". */
  hmEn: string
  hmFr: string
  /** Metric measure from the reference amount. */
  mm: number | null
  mmUnit: Unit
  /** What one serving weighs, when the metric measure is in mL. */
  servingWeightG: number | null
  /** The finished batch's weight, when baking or freezing loses water. Blank = the sum of the recipe. */
  batchWeightG: number | null
  containsEn: string
  containsFr: string
  storageEn: string
  storageFr: string
  /** Blank = the business in settings. */
  preparedBy: string
  ingredientsEn: string
  ingredientsFr: string
  // Norwegian label (EU format)
  nameNo: string
  /** Portion description, e.g. "1 skive". */
  hmNo: string
  storageNo: string
  /** "Best før: se lokket", or "Siste forbruksdag: …" for food that spoils fast. */
  durabilityNo: string
  /** Precautionary line, e.g. "Kan inneholde spor av nøtter." */
  allergyNoteNo: string
  /** Blank = generated. *Stars* mark emphasis. */
  ingredientsNo: string
  /** Add a per-portion column and %RI to the Norwegian table. */
  euPortion: boolean
  notes: string
  lines: Line[]
}

export type ReferenceAmount = {
  item: string
  category: string
  ra: string
  criteria: string
  units: string
  amount: number | null
  unit: Unit | null
}

export type Step = { raw: number; declared: number; rule: string }

export type Facts = {
  servingG: number | null
  batchG: number | null
  per100: Amounts | null
  perServing: Amounts | null
  /** The declared amounts, with the rounding step that made each. */
  declared: Record<NutrientKey, Step> | null
  dv: Record<DvKey, number> | null
  ingredientsEn: string
  ingredientsFr: string
  containsEn: string
  containsFr: string
  /** True when "Contains" came from the ingredients rather than typed in. */
  containsDerived: boolean
  warnings: string[]
}

// ------------------------------------------------------------------ rounding

/** Rounds to the nearest multiple of `step`, halves up. The epsilon absorbs float noise like 0.15/0.1. */
export function roundStep(x: number, step: number): number {
  const n = Math.floor(Math.abs(x) / step + 0.5 + 1e-9) * step
  return Math.sign(x) * Number(n.toFixed(6))
}

type Rule = (x: number) => Step
const step = (x: number, s: number, rule: string): Step => ({ raw: x, declared: roundStep(x, s), rule })
const zero = (x: number, rule: string): Step => ({ raw: x, declared: 0, rule })

const RULES: Record<string, Rule> = {
  cal: (x) => (x < 5 ? step(x, 1, '< 5: nearest 1') : x <= 50 ? step(x, 5, '5 to 50: nearest 5') : step(x, 10, '> 50: nearest 10')),
  fat: (x) => (x < 0.5 ? step(x, 0.1, '< 0.5 g: nearest 0.1 g') : x <= 5 ? step(x, 0.5, '0.5 to 5 g: nearest 0.5 g') : step(x, 1, '> 5 g: nearest 1 g')),
  carb: (x) => (x < 0.5 ? zero(x, '< 0.5 g: 0 g') : step(x, 1, '≥ 0.5 g: nearest 1 g')),
  protein: (x) => (x < 0.5 ? step(x, 0.1, '< 0.5 g: nearest 0.1 g') : step(x, 1, '≥ 0.5 g: nearest 1 g')),
  chol: (x) => step(x, 5, 'nearest 5 mg'),
  sodium: (x) => (x < 5 ? step(x, 1, '< 5 mg: nearest 1 mg') : x <= 140 ? step(x, 5, '5 to 140 mg: nearest 5 mg') : step(x, 10, '> 140 mg: nearest 10 mg')),
  potassium: (x) =>
    x < 5 ? zero(x, '< 5 mg: 0 mg') : x < 50 ? step(x, 10, '5 to < 50 mg: nearest 10 mg')
      : x < 250 ? step(x, 25, '50 to < 250 mg: nearest 25 mg') : step(x, 50, '≥ 250 mg: nearest 50 mg'),
  iron: (x) =>
    x < 0.05 ? zero(x, '< 0.05 mg: 0 mg') : x < 0.5 ? step(x, 0.1, '0.05 to < 0.5 mg: nearest 0.1 mg')
      : x < 2.5 ? step(x, 0.25, '0.5 to < 2.5 mg: nearest 0.25 mg') : step(x, 0.5, '≥ 2.5 mg: nearest 0.5 mg'),
}
const RULE_OF: Record<NutrientKey, string> = {
  cal: 'cal', fat: 'fat', sat: 'fat', trans: 'fat', carb: 'carb', fibre: 'carb', sugars: 'carb', protein: 'protein',
  chol: 'chol', sodium: 'sodium', potassium: 'potassium', calcium: 'potassium', iron: 'iron',
}

export const cfiaRound = (key: NutrientKey, x: number): Step => RULES[RULE_OF[key]](x)

/** % DV from the declared amounts, nearest 1 %; 0 % when the amount is 0. */
export function dailyValues(d: Record<NutrientKey, number>): Record<DvKey, number> {
  const out = {} as Record<DvKey, number>
  for (const { key, dv } of DAILY_VALUES) {
    const a = key === 'sattrans' ? d.sat + d.trans : d[key]
    out[key] = a === 0 ? 0 : roundStep((a / dv) * 100, 1)
  }
  return out
}

// ------------------------------------------------------------------ ingredients

export function servingGrams(i: Pick<Ingredient, 'servingAmount' | 'servingUnit' | 'gPerMl'>): number | null {
  if (i.servingAmount == null) return null
  if (i.servingUnit === 'mL') return i.gPerMl == null ? null : i.servingAmount * i.gPerMl
  return i.servingAmount
}

/** Per 100 g, blanks as 0. Null when the serving's weight is unknown. */
export function per100g(i: Ingredient): Amounts | null {
  const g = servingGrams(i)
  if (!g) return null
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, ((i.nutrients[k] ?? 0) / g) * 100])) as Amounts
}

/** Things on an ingredient's own label that don't add up, the way the workbook's Checks column finds them. */
export function ingredientChecks(i: Ingredient): string[] {
  const n = (k: NutrientKey) => i.nutrients[k] ?? 0
  const out: string[] = []
  if (servingGrams(i) == null) out.push(i.servingUnit === 'mL' ? 'Enter grams per mL (weigh 100 mL and divide by 100).' : 'Serving amount missing.')
  if (i.labelFormat === 'EU') {
    if (n('carb') - n('fibre') + 0.5 < n('sugars')) out.push('Sugars are more than carbohydrate.')
  } else if (n('carb') + 0.5 < n('fibre') + n('sugars')) out.push('Fibre + sugars are more than carbohydrate.')
  if (n('sat') + n('trans') > n('fat') + 0.05) out.push('Saturated + trans are more than fat.')
  const est = 9 * n('fat') + 4 * (n('carb') - n('fibre')) + 2 * n('fibre') + 4 * n('protein')
  if (Math.abs(n('cal') - est) > Math.max(10, 0.2 * n('cal'))) out.push(`Calories don't fit fat, carbohydrate and protein (expect about ${Math.round(est)}).`)
  // An EU label has no trans, cholesterol or minerals, and fibre is optional on it: only its own blanks count.
  const keys = i.labelFormat === 'EU' ? EU_LABEL_KEYS : NUTRIENT_KEYS
  const blanks = keys.filter((k) => i.nutrients[k] == null).length
  if (blanks) out.push(`${blanks} blank amount${blanks > 1 ? 's' : ''}, counted as 0.`)
  return out
}

/** The amounts an EU/Norwegian table always shows (sodium stands for salt). */
export const EU_LABEL_KEYS: NutrientKey[] = ['cal', 'fat', 'sat', 'carb', 'sugars', 'protein', 'sodium']

// ------------------------------------------------------------------ products

export function productServingG(p: Pick<Product, 'servingWeightG' | 'mm' | 'mmUnit'>): number | null {
  if (p.servingWeightG != null) return p.servingWeightG
  return p.mmUnit === 'g' ? p.mm : null
}

/** "Per 3/4 cup (188 mL)" / "pour 3/4 tasse (188 mL)". */
export function servingText(p: Pick<Product, 'hmEn' | 'hmFr' | 'mm' | 'mmUnit'>, lang: 'en' | 'fr'): string {
  const hm = lang === 'en' ? p.hmEn : p.hmFr
  const mm = p.mm == null ? '' : `${p.mm} ${p.mmUnit}`
  const word = lang === 'en' ? 'Per' : 'pour'
  return `${word} ${hm ? (mm ? `${hm} (${mm})` : hm) : mm}`.trim()
}

const listText = (parts: string[]) => parts.filter(Boolean).join(', ')

export type BatchLine = { ing: Ingredient; grams: number; blank: boolean }

/** The recipe's lines with their ingredients; lines naming a missing ingredient are dropped. */
export function batchLines(p: Pick<Product, 'lines'>, ingredients: Map<string, Ingredient>): BatchLine[] {
  return p.lines
    .map((l) => ({ ing: ingredients.get(l.ingredientId), grams: l.grams ?? 0, blank: l.grams == null }))
    .filter((l): l is BatchLine => !!l.ing)
}

/** Per 100 g of the finished batch: each ingredient's share, over the batch's weight. */
export function per100Batch(lines: BatchLine[], batchG: number): Amounts {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [
    k, (lines.reduce((s, l) => s + (l.grams * (per100g(l.ing)?.[k] ?? 0)) / 100, 0) / batchG) * 100,
  ])) as Amounts
}

/** The ingredient list, heaviest first; lines with the same label name are added together. */
function ingredientList(lines: { ing: Ingredient; grams: number }[], lang: 'en' | 'fr'): string {
  const byName = new Map<string, number>()
  for (const { ing, grams } of lines) {
    const name = (lang === 'en' ? ing.labelEn : ing.labelFr).trim() || ing.name
    byName.set(name, (byName.get(name) ?? 0) + grams)
  }
  return listText([...byName.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name))
}

function allergenText(keys: Set<AllergenKey>, lang: 'en' | 'fr'): string {
  return listText(ALLERGENS.filter((a) => a.ca && keys.has(a.key)).map((a) => a[lang]))
}

export function computeFacts(p: Product, ingredients: Map<string, Ingredient>, ras: ReferenceAmount[] = []): Facts {
  const warnings: string[] = []
  const lines = batchLines(p, ingredients)

  const sum = lines.reduce((s, l) => s + l.grams, 0)
  const batchG = p.batchWeightG ?? (lines.length ? sum : null)
  const servingG = productServingG(p)

  if (servingG == null) warnings.push(p.mmUnit === 'mL' ? 'Enter what one serving weighs in grams (the serving is in mL).' : 'Enter the serving size.')
  if (!lines.length) warnings.push('No ingredients in the recipe yet.')
  if (lines.some((l) => l.blank)) warnings.push('Some recipe amounts are blank and count as 0.')
  const unweighable = lines.filter((l) => per100g(l.ing) == null).map((l) => l.ing.name)
  if (unweighable.length) warnings.push(`No serving weight for ${listText(unweighable)}, so it adds nothing to the label.`)
  const blanks = lines.filter((l) => NUTRIENT_KEYS.some((k) => l.ing.nutrients[k] == null)).map((l) => l.ing.name)
  if (blanks.length) warnings.push(`Blank amounts count as 0 in ${listText(blanks)}; the label may understate them.`)
  if (p.batchWeightG != null && p.batchWeightG > sum + 0.5) warnings.push(`The finished batch (${p.batchWeightG} g) weighs more than its ingredients (${Math.round(sum)} g).`)

  if (!p.raItem) warnings.push('Choose a reference amount (RA) item.')
  else {
    const ra = ras.find((r) => r.item === p.raItem)
    if (ras.length && !ra) warnings.push(`${p.raItem} is not in the Table of Reference Amounts.`)
    if (ra?.amount != null && p.mm != null && Math.abs(p.mm - ra.amount) > 0.5 * ra.amount)
      warnings.push(`The serving is far from the reference amount (${ra.ra}).`)
    if (ra?.unit && p.mm != null && ra.unit !== p.mmUnit) warnings.push(`The reference amount is in ${ra.unit}; the serving is in ${p.mmUnit}.`)
  }

  let per100: Amounts | null = null
  let perServing: Amounts | null = null
  let declared: Facts['declared'] = null
  let dv: Facts['dv'] = null
  if (batchG) {
    per100 = per100Batch(lines, batchG)
    if (servingG != null) {
      perServing = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, (per100![k] * servingG) / 100])) as Amounts
      declared = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, cfiaRound(k, perServing![k])])) as Record<NutrientKey, Step>
      const d = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, declared![k].declared])) as Record<NutrientKey, number>
      dv = dailyValues(d)
      if (d.carb < d.fibre + d.sugars) warnings.push('Carbohydrate is less than fibre + sugars: check the ingredient data.')
    }
  }

  const keys = new Set<AllergenKey>(lines.flatMap((l) => l.ing.allergens))
  const derived = !p.containsEn.trim() && !p.containsFr.trim()
  return {
    servingG, batchG, per100, perServing, declared, dv,
    ingredientsEn: p.ingredientsEn.trim() || ingredientList(lines, 'en'),
    ingredientsFr: p.ingredientsFr.trim() || ingredientList(lines, 'fr'),
    containsEn: derived ? allergenText(keys, 'en') : p.containsEn.trim(),
    containsFr: derived ? allergenText(keys, 'fr') : p.containsFr.trim(),
    containsDerived: derived,
    warnings,
  }
}

/** A declared amount as printed: no trailing zeros, "0.25" stays "0.25". */
export const fmt = (n: number, lang: 'en' | 'fr' = 'en') => {
  const s = String(Number(n.toFixed(2)))
  return lang === 'fr' ? s.replace('.', ',') : s
}
