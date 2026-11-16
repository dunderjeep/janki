/**
 * The EU/EEA nutrition declaration, as Norway uses it (matinformasjonsforskriften,
 * which takes in Regulation (EU) No 1169/2011), from the same recipe and
 * ingredients as the Canadian table.
 *
 * What differs from Canada, and where it is handled here:
 * - Per 100 g (per 100 ml for liquids), with an optional per-portion column.
 * - Carbohydrate leaves fibre out; ingredients are stored the Canadian way
 *   (fibre included), so it is subtracted.
 * - Salt, not sodium: salt = sodium × 2.5 (Annex I, point 11).
 * - Energy in kJ and kcal, worked out from the nutrients with the Annex XIV
 *   factors, not added up from the ingredients' own labels.
 * - Rounding: the European Commission's guidance on tolerances (December
 *   2012), table "Rounding guidelines for nutrition labelling".
 * - %RI against the reference intakes of Annex XIII, from the unrounded amount.
 * - Allergens are emphasised in the ingredient list itself; there is no
 *   "Contains" statement.
 */
import {
  batchLines, EU_LABEL_KEYS, per100Batch, per100g, productServingG, roundStep,
  type Ingredient, type Product,
} from './engine'
import { ALLERGENS, REFERENCE_INTAKES, type AllergenKey, type RiKey } from './nutrients'

export type EuKey = 'kj' | 'kcal' | 'fat' | 'sat' | 'carb' | 'sugars' | 'fibre' | 'protein' | 'salt'
export const EU_KEYS: EuKey[] = ['kj', 'kcal', 'fat', 'sat', 'carb', 'sugars', 'fibre', 'protein', 'salt']

/** One amount as declared: the text to print (Norwegian decimals) and the step that made it. */
export type EuStep = { raw: number; text: string; rule: string }
export type EuColumn = Record<EuKey, EuStep>

export type EuFacts = {
  /** "g", or "ml" when the portion is a volume and its weight is known. */
  basis: 'g' | 'ml'
  batchG: number | null
  /** What one portion weighs, and its size in the basis unit (g or ml). */
  portionG: number | null
  portionAmount: number | null
  /** Unrounded, per 100 g or 100 ml. */
  per100: Record<EuKey, number> | null
  col100: EuColumn | null
  colPortion: EuColumn | null
  /** % of the reference intake per portion, nearest 1 %. Fibre has none. */
  ri: Partial<Record<EuKey, number>> | null
  /** Fibre is optional in the EU; it is shown when the recipe has any. */
  showFibre: boolean
  /** The kcal the ingredients' own labels add up to, per 100, beside the worked-out energy. */
  kcalFromLabels: number | null
  /** The ingredient list, heaviest first, with *stars* around what must be emphasised. */
  ingredients: string
  warnings: string[]
}

// ------------------------------------------------------------------ rounding

/** Norwegian decimals: "5,0", "0,25". */
export const noNumber = (n: number, decimals: number) => n.toFixed(decimals).replace('.', ',')

type Band = { from: number; step: number; decimals: number; rule: string }
type EuRule = { bands: Band[]; below: number; belowText: string; belowRule: string }

const MACRO: EuRule = {
  bands: [
    { from: 10, step: 1, decimals: 0, rule: '≥ 10 g: nearest 1 g' },
    { from: 0.5, step: 0.1, decimals: 1, rule: '0.5 to < 10 g: nearest 0.1 g' },
  ],
  below: 0.5, belowText: '<0,5', belowRule: '≤ 0.5 g: "<0,5 g"',
}
const RULES: Record<EuKey, EuRule> = {
  kj: { bands: [{ from: 0, step: 1, decimals: 0, rule: 'nearest 1 kJ' }], below: 0, belowText: '0', belowRule: '' },
  kcal: { bands: [{ from: 0, step: 1, decimals: 0, rule: 'nearest 1 kcal' }], below: 0, belowText: '0', belowRule: '' },
  fat: MACRO, carb: MACRO, sugars: MACRO, fibre: MACRO, protein: MACRO,
  sat: {
    bands: [
      { from: 10, step: 1, decimals: 0, rule: '≥ 10 g: nearest 1 g' },
      { from: 0.1, step: 0.1, decimals: 1, rule: '0.1 to < 10 g: nearest 0.1 g' },
    ],
    below: 0.1, belowText: '<0,1', belowRule: '≤ 0.1 g: "<0,1 g"',
  },
  salt: {
    bands: [
      { from: 1, step: 0.1, decimals: 1, rule: '≥ 1 g: nearest 0.1 g' },
      { from: 0.0125, step: 0.01, decimals: 2, rule: '0.0125 to < 1 g: nearest 0.01 g' },
    ],
    below: 0.0125, belowText: '<0,01', belowRule: '≤ 0.0125 g: "<0,01 g"',
  },
}

/** One amount rounded the way the Commission's guidance says, as Norwegian text. Exactly 0 prints "0". */
export function euRound(key: EuKey, x: number): EuStep {
  const r = RULES[key]
  if (x <= 0) return { raw: x, text: '0', rule: 'none: 0' }
  if (r.below > 0 && x <= r.below) return { raw: x, text: r.belowText, rule: r.belowRule }
  const band = r.bands.find((b) => x >= b.from) ?? r.bands[r.bands.length - 1]
  return { raw: x, text: noNumber(roundStep(x, band.step), band.decimals), rule: band.rule }
}

// ------------------------------------------------------------------ amounts

/**
 * The EU amounts from the stored (Canadian-style) ones, per 100 g. Energy is
 * worked out with the Annex XIV factors: fat 37 kJ / 9 kcal per g,
 * carbohydrate and protein 17 / 4, fibre 8 / 2. Polyols and alcohol are not
 * tracked, so a recipe with sugar alcohols or spirits needs its energy checked.
 */
export function euAmounts(a: Record<'fat' | 'sat' | 'carb' | 'sugars' | 'fibre' | 'protein' | 'sodium', number>): Record<EuKey, number> {
  const carb = Math.max(0, a.carb - a.fibre)
  return {
    kj: 37 * a.fat + 17 * carb + 17 * a.protein + 8 * a.fibre,
    kcal: 9 * a.fat + 4 * carb + 4 * a.protein + 2 * a.fibre,
    fat: a.fat, sat: a.sat, carb, sugars: a.sugars, fibre: a.fibre, protein: a.protein,
    salt: (a.sodium * 2.5) / 1000,
  }
}

const column = (v: Record<EuKey, number>): EuColumn =>
  Object.fromEntries(EU_KEYS.map((k) => [k, euRound(k, v[k])])) as EuColumn

// ------------------------------------------------------------------ allergens

/**
 * An ingredient's name with its allergens emphasised. A name that already
 * has *stars* is left as typed. Otherwise the allergen's word is starred where
 * the name contains it ("*hvete*mel"), and added in brackets where it doesn't
 * ("mozzarella (*melk*)"), since the name must make the allergen plain.
 */
export function emphasise(name: string, allergens: readonly AllergenKey[]): string {
  if (!allergens.length || name.includes('*')) return name
  let out = name
  const missing: string[] = []
  for (const a of ALLERGENS) {
    if (!allergens.includes(a.key)) continue
    const lower = out.toLowerCase()
    const stem = a.noMatch.find((m) => lower.includes(m))
    if (!stem) {
      missing.push(a.no)
      continue
    }
    const i = lower.indexOf(stem)
    out = `${out.slice(0, i)}*${out.slice(i, i + stem.length)}*${out.slice(i + stem.length)}`
  }
  return missing.length ? `${out} (${missing.map((m) => `*${m}*`).join(', ')})` : out
}

/** Splits "*hvete*mel" into text and emphasised parts, for printing. */
export function emphasisParts(s: string): { text: string; bold: boolean }[] {
  return s.split(/\*([^*]+)\*/).map((text, i) => ({ text, bold: i % 2 === 1 })).filter((p) => p.text)
}

// ------------------------------------------------------------------ the declaration

const listText = (parts: string[]) => parts.filter(Boolean).join(', ')

export function computeEu(p: Product, ingredients: Map<string, Ingredient>): EuFacts {
  const warnings: string[] = []
  const lines = batchLines(p, ingredients)
  const sum = lines.reduce((s, l) => s + l.grams, 0)
  const batchG = p.batchWeightG ?? (lines.length ? sum : null)

  if (!p.nameNo.trim()) warnings.push('Give the product its Norwegian name.')
  if (!lines.length) warnings.push('No ingredients in the recipe yet.')
  if (lines.some((l) => l.blank)) warnings.push('Some recipe amounts are blank and count as 0.')
  const unweighable = lines.filter((l) => per100g(l.ing) == null).map((l) => l.ing.name)
  if (unweighable.length) warnings.push(`No serving weight for ${listText(unweighable)}, so it adds nothing to the label.`)
  const blanks = lines.filter((l) => EU_LABEL_KEYS.some((k) => l.ing.nutrients[k] == null)).map((l) => l.ing.name)
  if (blanks.length) warnings.push(`Blank amounts count as 0 in ${listText([...new Set(blanks)])}; the label may understate them.`)
  if (p.batchWeightG != null && p.batchWeightG > sum + 0.5) warnings.push(`The finished batch (${p.batchWeightG} g) weighs more than its ingredients (${Math.round(sum)} g).`)
  const unnamed = [...new Set(lines.filter((l) => !l.ing.labelNo.trim()).map((l) => l.ing.name))]
  if (unnamed.length && !p.ingredientsNo.trim()) warnings.push(`No Norwegian name for ${listText(unnamed)}; your own name is used in the ingredient list.`)

  // A volume portion with a known weight puts the table per 100 ml.
  const portionG = productServingG(p)
  const density = p.mmUnit === 'mL' && p.mm && p.servingWeightG ? p.servingWeightG / p.mm : null
  const basis: 'g' | 'ml' = density ? 'ml' : 'g'
  if (p.mmUnit === 'mL' && !density) warnings.push('For a drink the table should be per 100 ml: enter what one portion weighs, in grams.')
  const portionAmount = p.euPortion && portionG != null ? (density ? p.mm : portionG) : null
  if (p.euPortion && portionG == null) warnings.push('Enter the portion size, or turn off the per-portion column.')

  let per100: EuFacts['per100'] = null
  let col100: EuFacts['col100'] = null
  let colPortion: EuFacts['colPortion'] = null
  let ri: EuFacts['ri'] = null
  let kcalFromLabels: number | null = null
  if (batchG) {
    const g = per100Batch(lines, batchG)
    const scale = density ?? 1 // per 100 ml = per 100 g × grams per ml
    const perG100 = euAmounts(g)
    per100 = Object.fromEntries(EU_KEYS.map((k) => [k, perG100[k] * scale])) as Record<EuKey, number>
    kcalFromLabels = g.cal * scale
    col100 = column(per100)
    if (portionAmount != null && portionG != null) {
      const perPortion = Object.fromEntries(EU_KEYS.map((k) => [k, (perG100[k] * portionG) / 100])) as Record<EuKey, number>
      colPortion = column(perPortion)
      ri = {}
      for (const k of EU_KEYS) {
        if (k === 'fibre') continue
        ri[k] = roundStep((perPortion[k] / REFERENCE_INTAKES[k as RiKey]) * 100, 1)
      }
    }
    if (per100.sugars > per100.carb + 0.05) warnings.push('Sugars are more than carbohydrate: check the ingredient data.')
  }

  const showFibre = per100 != null && per100.fibre > 0

  return {
    basis, batchG, portionG: portionAmount != null ? portionG : null, portionAmount,
    per100, col100, colPortion, ri, showFibre, kcalFromLabels,
    ingredients: p.ingredientsNo.trim() || ingredientListNo(lines),
    warnings,
  }
}

/** Heaviest first; lines with the same Norwegian name are added together and their allergens joined. */
function ingredientListNo(lines: { ing: Ingredient; grams: number }[]): string {
  const byName = new Map<string, { grams: number; allergens: Set<AllergenKey> }>()
  for (const { ing, grams } of lines) {
    const name = ing.labelNo.trim() || ing.name
    const e = byName.get(name) ?? { grams: 0, allergens: new Set<AllergenKey>() }
    e.grams += grams
    for (const a of ing.allergens) e.allergens.add(a)
    byName.set(name, e)
  }
  return listText([...byName.entries()].sort((a, b) => b[1].grams - a[1].grams).map(([name, e]) => emphasise(name, [...e.allergens])))
}
