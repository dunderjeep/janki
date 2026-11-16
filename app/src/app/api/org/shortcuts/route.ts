import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { noteAt, orgText } from 'notes/server'
import { notesRoute } from '@/lib/notesHost'

export const dynamic = 'force-dynamic'

/** The note holding the cheat sheet. */
const FILE = process.env.NOTES_SHORTCUTS ?? 'keyboard_shortcuts.org'

export type Shortcut = { key: string | null; text: string }

/** Does this token look like part of a key sequence rather than prose? */
function keyish(tok: string): boolean {
  return /^[CMS]-\S+$/.test(tok)              // C-c, M-x, S-<up>
    || /^<[^>]+>$/.test(tok)                  // <f5>
    || /^(RET|SPC|TAB|ESC|DEL)$/.test(tok)
    || /^[a-z0-9]$/.test(tok)                 // the trailing letter of C-c f c
}

/**
 * Split a line into the keys and what they do.
 *
 * The file is written by hand and is not consistent — some lines separate the
 * two with a colon, some with a space, some are a bare note with no key at all.
 * Rather than demanding a format, anything unrecognised is passed through as
 * text, which is what a personal cheat sheet is mostly made of.
 */
function parse(line: string): Shortcut | null {
  const body = line.replace(/^\*+\s*/, '').trim()
  if (!body) return null

  const colon = /^([^:]{1,24}?)\s*:\s*(.+)$/.exec(body)
  if (colon && colon[1].split(/\s+/).every(keyish)) {
    return { key: colon[1].trim(), text: colon[2].trim() }
  }

  // Otherwise take the leading run of key-looking tokens, greedily: "C-c p
  // org-pomodoro" has a two-token key, and stopping at the first split it into
  // "C-c" and "p org-pomodoro".
  const toks = body.split(/\s+/)
  let n = 0
  while (n < toks.length && n < 5 && keyish(toks[n])) n++
  if (n > 0 && !(n === 1 && /^[a-z0-9]$/.test(toks[0])) && n < toks.length) {
    return { key: toks.slice(0, n).join(' '), text: toks.slice(n).join(' ') }
  }

  return { key: null, text: body }
}

export async function GET() {
  return notesRoute(async (did) => {
    const found = await noteAt(did, FILE)
    if (!found) return { shortcuts: [], file: FILE, error: 'No shortcuts note' }
    const shortcuts = orgText(found.note)
      .split('\n')
      // Drop the property drawer and #+keywords: they are not shortcuts.
      .filter(l => !/^\s*(:[A-Z_]+:|#\+|:END:)/.test(l))
      .map(parse)
      .filter((s): s is Shortcut => s !== null)
    return { shortcuts, file: FILE }
  })
}
