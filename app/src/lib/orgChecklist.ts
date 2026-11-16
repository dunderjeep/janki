/**
 * Checkbox lines in org text: tick one, add one, delete one, and keep the
 * heading's [3/15] or [20%] cookie true afterwards, as org does.
 *
 * Pure text in, text out. The panels' notes are edited through notes'
 * editText(), which parses the result back into the note.
 */
import { AppError } from '@janki/app-kit/api'

export const CHECKBOX = /^[ \t]*[-+*][ \t]*\[([ Xx-])\][ \t]*(.+?)[ \t]*$/
const HEADING = /^\*+ /

/**
 * The checkbox to act on: the one on `line` (1-based) if it still holds
 * `raw`, else the nearest one that does. Lines shift when something above is
 * added, so the text is what identifies the item; the line only breaks ties.
 */
function find(lines: string[], line: number, raw: string): number {
  const holds = (i: number) => {
    const m = CHECKBOX.exec(lines[i] ?? '')
    return Boolean(m && m[2] === raw)
  }
  if (holds(line - 1)) return line - 1
  let best = -1
  for (let i = 0; i < lines.length; i++) {
    if (holds(i) && (best < 0 || Math.abs(i - (line - 1)) < Math.abs(best - (line - 1)))) best = i
  }
  if (best < 0) throw new AppError('That item is no longer in the list. Reload it.', 409)
  return best
}

/** Recounts the checkboxes under the heading above line `i`, into its cookie. */
function recount(lines: string[], i: number) {
  let h = i
  while (h >= 0 && !HEADING.test(lines[h])) h--
  if (h < 0 || !/\[(\d+\/\d+|\d+%)\]/.test(lines[h])) return
  let done = 0, total = 0
  for (let j = h + 1; j < lines.length && !HEADING.test(lines[j]); j++) {
    const m = CHECKBOX.exec(lines[j])
    if (!m) continue
    total++
    if (m[1] === 'X' || m[1] === 'x') done++
  }
  lines[h] = lines[h]
    .replace(/\[\d+\/\d+\]/, `[${done}/${total}]`)
    .replace(/\[\d+%\]/, `[${total ? Math.round((100 * done) / total) : 0}%]`)
}

export function setCheckbox(text: string, line: number, raw: string, want: 'done' | 'open'): string {
  const lines = text.split('\n')
  const i = find(lines, line, raw)
  lines[i] = lines[i].replace(/\[([ Xx-])\]/, want === 'done' ? '[X]' : '[ ]')
  recount(lines, i)
  return lines.join('\n')
}

export function deleteCheckbox(text: string, line: number, raw: string): string {
  const lines = text.split('\n')
  const i = find(lines, line, raw)
  lines.splice(i, 1)
  recount(lines, Math.min(i, lines.length - 1))
  return lines.join('\n')
}

/** A new unticked item after the last checkbox, or at the end. */
export function appendCheckbox(text: string, item: string): string {
  const clean = item.replace(/[\r\n]+/g, ' ').trim()
  if (!clean) throw new AppError('Write something to add')
  const lines = text.split('\n')
  let last = -1
  for (let i = 0; i < lines.length; i++) if (CHECKBOX.test(lines[i])) last = i
  if (last < 0) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push(`- [ ] ${clean}`, '')
    return lines.join('\n')
  }
  const indent = /^[ \t]*/.exec(lines[last])![0]
  lines.splice(last + 1, 0, `${indent}- [ ] ${clean}`)
  recount(lines, last + 1)
  return lines.join('\n')
}
