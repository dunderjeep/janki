/**
 * Parses every .org file under a folder, writes it back, and reports what differs.
 *
 *   npx tsx test/roundtrip.ts ~/org
 *
 * "exact" means byte for byte. "layout only" means the only changes are ones
 * the importer makes on purpose: LF line endings, spacing, indentation of
 * drawers and planning lines, the case of #+TITLE, and the :a:b: form of
 * #+filetags. Anything else is a real loss, and the first few are printed.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { orgText, parseOrg } from '../src/lib/org'
import { orgFiles } from '../src/mirror'

/** The file with only the importer's deliberate normalisations taken out. */
export function layout(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const l = line.trim().replace(/[ \t]+/g, ' ')
    const ft = /^#\+filetags: ?(.*)$/i.exec(l)
    if (ft) return `#+filetags: ${ft[1].split(/[:\s]+/).filter(Boolean).join(' ')}`
    return l.replace(/^#\+title:/i, '#+title:')
  }).join('\n')
}

async function main() {
  const root = process.argv[2]
  if (!root) throw new Error('usage: roundtrip.ts <org folder>')
  let files = 0, exact = 0, layoutOnly = 0, headings = 0, todos = 0, ids = 0, planned = 0, titled = 0
  const lossy: string[] = []
  const t0 = performance.now()
  for await (const file of orgFiles(root)) {
    files++
    const text = await readFile(file, 'utf8')
    const parsed = parseOrg(text)
    headings += parsed.headings.length
    todos += parsed.headings.filter((h) => h.todo).length
    planned += parsed.headings.filter((h) => h.scheduled || h.deadline || h.closed).length
    ids += parsed.headings.filter((h) => h.properties?.some((p) => p.key === 'ID')).length + (parsed.properties?.some((p) => p.key === 'ID') ? 1 : 0)
    if (parsed.title !== undefined) titled++
    const back = orgText(parsed)
    if (back === text) exact++
    else if (layout(back) === layout(text)) layoutOnly++
    else lossy.push(file)
  }
  const ms = Math.round(performance.now() - t0)
  console.log({ files, exact, layoutOnly, lossy: lossy.length, headings, todos, planned, ids, titled, ms })
  for (const f of lossy.slice(0, 10)) {
    const text = await readFile(f, 'utf8')
    const back = layout(orgText(parseOrg(text))).split('\n')
    const orig = layout(text).split('\n')
    const at = orig.findIndex((l, i) => l !== back[i])
    console.log(`\n${path.relative(root, f)} line ${at + 1}\n  was: ${JSON.stringify(orig[at])}\n  now: ${JSON.stringify(back[at])}`)
  }
}

if (process.argv[1]?.endsWith('roundtrip.ts')) main().catch((e) => { console.error(e); process.exit(1) })
