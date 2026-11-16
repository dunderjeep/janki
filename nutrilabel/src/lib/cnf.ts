/**
 * The Canadian Nutrient File (Health Canada), per 100 g: a starting point for
 * an ingredient whose package you don't have. Loaded on the first search.
 *
 * data/cnf.json rows: [code, food group, name EN, name FR, [13 nutrients per 100 g]].
 */
import { NUTRIENT_KEYS, type Nutrients } from './nutrients'

type Row = [number, string, string, string, (number | null)[]]
export type CnfFood = { code: number; group: string; en: string; fr: string; per100: Nutrients }

let rows: Promise<Row[]> | null = null
const load = () => (rows ??= import('../../data/cnf.json').then((m) => (m.default ?? m) as unknown as Row[]))

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const toFood = ([code, group, en, fr, v]: Row): CnfFood => ({
  code, group, en, fr, per100: Object.fromEntries(NUTRIENT_KEYS.map((k, i) => [k, v[i] ?? null])) as Nutrients,
})

/** True when some word of `text` starts with `w`: "salted" finds "salted", not "unsalted". */
const startsWord = (text: string, w: string) => {
  for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1)) if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return true
  return false
}

/** Foods whose English or French name has a word starting with each word of the query; names starting with the first word first. */
export async function searchCnf(query: string, limit = 40): Promise<CnfFood[]> {
  const words = fold(query).split(/[\s,]+/).filter(Boolean)
  if (!words.length) return []
  const hits: { row: Row; score: number }[] = []
  for (const row of await load()) {
    const en = fold(row[2])
    const fr = fold(row[3])
    if (!words.every((w) => startsWord(en, w) || startsWord(fr, w))) continue
    const score = (en.startsWith(words[0]) || fr.startsWith(words[0]) ? 0 : 1000) + Math.min(en.length, fr.length)
    hits.push({ row, score })
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map((h) => toFood(h.row))
}

export async function cnfFood(code: number): Promise<CnfFood | null> {
  const row = (await load()).find((r) => r[0] === code)
  return row ? toFood(row) : null
}
