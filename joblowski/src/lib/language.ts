/**
 * The language an ad is written in, from its most common little words. Only
 * words that belong to one language count, so "for" and "in" are left out.
 */
const MARKERS: Record<'en' | 'no' | 'de', string[]> = {
  en: ['the', 'and', 'you', 'with', 'our', 'are', 'will', 'is', 'of', 'this', 'your', 'from', 'we', 'have', 'be'],
  no: ['og', 'vi', 'du', 'deg', 'er', 'av', 'på', 'som', 'det', 'å', 'ikke', 'søker', 'våre', 'hos', 'kan', 'skal', 'har', 'til', 'med', 'en'],
  de: ['und', 'der', 'die', 'das', 'wir', 'sie', 'mit', 'für', 'ist', 'ein', 'eine', 'nicht', 'bei', 'auf', 'werden', 'sind', 'du', 'zu'],
}
const SETS = Object.fromEntries(Object.entries(MARKERS).map(([k, v]) => [k, new Set(v)])) as Record<keyof typeof MARKERS, Set<string>>

/** 'en', 'no', 'de' or 'other'; null when there is too little text to say. */
export function detectLanguage(text: string): string | null {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)
  if (words.length < 20) return null
  const score: Record<keyof typeof MARKERS, number> = { en: 0, no: 0, de: 0 }
  for (const w of words) for (const k of Object.keys(SETS) as (keyof typeof MARKERS)[]) if (SETS[k].has(w)) score[k]++
  const ranked = (Object.entries(score) as [keyof typeof MARKERS, number][]).sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  if (best[1] < 4 || best[1] < second[1] * 1.5) return 'other'
  return best[0]
}
