/**
 * Statement parsing: file bytes → sheets of cells → statement lines.
 *
 * Knows the three export shapes and nothing about the ledger. Every line comes
 * out signed as a DEBIT to the account it belongs to (see statement_lines in
 * 0013_banki.sql), and in chronological order.
 *
 *   td_chequing   no header · date, description, withdrawal, deposit, balance
 *   td_visa       no header · date, description, charge, payment, balance owing
 *   pc_mastercard header     · Description, Type, Card Holder Name, Date, Time, Amount
 *                              (Amount signed: − charge, + payment/credit; no balance)
 */
import { parse as parseCsv } from 'csv-parse/sync'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import type { StatementFormat } from '@/db/schema/banki'
import { parseCents } from './money'

export type Sheet = { name: string | null; rows: string[][] }

export type ParsedLine = {
  postedOn: string              // YYYY-MM-DD
  description: string
  amountCents: number           // debit-positive for the statement's account
  balanceCents: number | null   // debit-positive; null when the export has none
  kind: string | null           // the export's own transaction type, if it has one
  raw: string[]
}

export type SkippedRow = { row: number; raw: string[]; reason: string }

export type ParsedStatement = { lines: ParsedLine[]; skipped: SkippedRow[] }

export const FORMAT_LABELS: Record<StatementFormat, string> = {
  td_chequing: 'TD chequing export',
  td_visa: 'TD Visa export',
  pc_mastercard: 'PC Financial Mastercard export',
}

// ── Files → sheets ────────────────────────────────────────────────────────────

export function readSheets(filename: string, bytes: Buffer): Sheet[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.ods')) return readOds(bytes)
  if (lower.endsWith('.csv')) return [{ name: null, rows: readCsv(bytes) }]
  throw new Error(`unsupported file type: ${filename} — expected .csv or .ods`)
}

function readCsv(bytes: Buffer): string[][] {
  let text = bytes.toString('utf8')
  // Bank exports are often Windows-1252, not UTF-8; a replacement character is
  // the tell ("TRAKTØREN" would otherwise arrive as "TRAKT�REN").
  if (text.includes('�')) text = bytes.toString('latin1')
  const rows = parseCsv(text.replace(/^﻿/, ''), {
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][]
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/* eslint-disable @typescript-eslint/no-explicit-any -- walking parsed ODS XML */
function readOds(bytes: Buffer): Sheet[] {
  const entry = new AdmZip(bytes).getEntry('content.xml')
  if (!entry) throw new Error('not an OpenDocument spreadsheet: no content.xml inside')

  const doc = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    isArray: (name) =>
      [
        'table:table', 'table:table-row', 'table:table-cell', 'text:p',
        'table:table-rows', 'table:table-header-rows', 'table:table-row-group',
      ].includes(name),
  }).parse(entry.getData().toString('utf8'))

  const tables: any[] =
    doc['office:document-content']?.['office:body']?.['office:spreadsheet']?.['table:table'] ?? []

  return tables.map((t) => ({ name: String(t['@table:name']), rows: odsRows(t) }))
}

function odsRows(table: any): string[][] {
  const rows: string[][] = []
  for (const r of collectRows(table)) {
    const cells: string[] = []
    for (const c of r['table:table-cell'] ?? []) {
      const value = odsCell(c)
      const repeat = Math.min(Number(c?.['@table:number-columns-repeated'] ?? 1), 256)
      for (let i = 0; i < repeat; i++) cells.push(value)
    }
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    if (cells.length === 0) continue
    // Repeated non-empty rows are real rows; the huge repeats are always blank
    // filler, which the `continue` above has already dropped.
    const repeat = Math.min(Number(r['@table:number-rows-repeated'] ?? 1), 1000)
    for (let i = 0; i < repeat; i++) rows.push(cells)
  }
  return rows
}

function collectRows(node: any): any[] {
  const out: any[] = [...(node['table:table-row'] ?? [])]
  for (const group of ['table:table-header-rows', 'table:table-rows', 'table:table-row-group']) {
    for (const child of node[group] ?? []) out.push(...collectRows(child))
  }
  return out
}

function odsCell(c: any): string {
  if (typeof c !== 'object' || c === null) return ''
  const type = c['@office:value-type']
  // Typed cells carry their true value in an attribute; the text is only the
  // display format (which might say "$1,530.06" or "Jan 2").
  if (type === 'float' || type === 'currency' || type === 'percentage') return String(c['@office:value'])
  if (type === 'date') return String(c['@office:date-value']).slice(0, 10)
  return (c['text:p'] ?? []).map(odsText).join('\n').trim()
}

function odsText(node: any): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node !== 'object' || node === null) return ''
  let out = ''
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@')) continue
    if (key === 'text:s') {
      // <text:s text:c="3"/> is three spaces
      for (const s of Array.isArray(value) ? value : [value]) out += ' '.repeat(Number((s as any)?.['@text:c'] ?? 1))
      continue
    }
    for (const v of Array.isArray(value) ? value : [value]) out += odsText(v)
  }
  return out
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Sheets → statement lines ──────────────────────────────────────────────────

/** Which export a sheet is. `label` is the tab name, or the filename for a CSV. */
export function guessFormat(label: string, rows: string[][]): StatementFormat | null {
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  if (head[0] === 'description' && head.includes('card holder name')) return 'pc_mastercard'
  const name = label.toLowerCase()
  if (/chequing|checking/.test(name)) return 'td_chequing'
  if (/visa/.test(name)) return 'td_visa'
  if (/mastercard|pc financial/.test(name)) return 'pc_mastercard'
  return null
}

export function parseStatement(format: StatementFormat, rows: string[][]): ParsedStatement {
  const parsed = format === 'pc_mastercard' ? parsePc(rows) : parseTd(format, rows)
  return { lines: chronological(parsed.lines), skipped: parsed.skipped }
}

function parseTd(format: 'td_chequing' | 'td_visa', rows: string[][]): ParsedStatement {
  const lines: ParsedLine[] = []
  const skipped: SkippedRow[] = []

  rows.forEach((raw, i) => {
    try {
      const [date, description = '', out = '', into = '', balance = ''] = raw
      const postedOn = parseDate(date)
      // Column 3 takes value out of the account's debit side (a withdrawal from
      // chequing, a charge on the Visa); column 4 adds to it. Same sum for both.
      const amountCents = parseCents(into) - parseCents(out)
      if (amountCents === 0) throw new Error('zero amount')
      const printed = balance.trim() === '' ? null : parseCents(balance)
      lines.push({
        postedOn,
        description: tidy(description),
        amountCents,
        // TD prints the Visa balance as the amount owing — a credit balance.
        balanceCents: printed === null ? null : format === 'td_visa' ? -printed : printed,
        kind: null,
        raw,
      })
    } catch (err) {
      skipped.push({ row: i + 1, raw, reason: (err as Error).message })
    }
  })

  return { lines, skipped }
}

function parsePc(rows: string[][]): ParsedStatement {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`PC Financial export has no "${name}" column`)
    return i
  }
  const [iDesc, iType, iDate, iAmount] = ['description', 'type', 'date', 'amount'].map(col)

  const lines: ParsedLine[] = []
  const skipped: SkippedRow[] = []

  rows.slice(1).forEach((raw, i) => {
    try {
      const amountCents = parseCents(raw[iAmount] ?? '')
      if (amountCents === 0) throw new Error('zero amount')
      lines.push({
        postedOn: parseDate(raw[iDate] ?? ''),
        description: tidy(raw[iDesc] ?? ''),
        amountCents, // already signed the ledger's way: − charge, + payment
        balanceCents: null,
        kind: (raw[iType] ?? '').trim() || null,
        raw,
      })
    } catch (err) {
      skipped.push({ row: i + 2, raw, reason: (err as Error).message })
    }
  })

  return { lines, skipped }
}

export function parseDate(input: string): string {
  const s = (input ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m && Number(m[1]) <= 12) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  throw new Error(`not a date: "${s}"`)
}

function tidy(description: string): string {
  return description.trim().replace(/\s+/g, ' ')
}

/**
 * Oldest first. Exports come newest-first (TD Visa, PC) or oldest-first (TD
 * chequing). Reversing a newest-first file before a stable sort keeps same-day
 * lines in the order they happened, which the running balance depends on.
 */
function chronological(lines: ParsedLine[]): ParsedLine[] {
  const ordered = lines.length > 1 && lines[0].postedOn > lines[lines.length - 1].postedOn
    ? [...lines].reverse()
    : [...lines]
  return ordered.sort((a, b) => (a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : 0))
}
