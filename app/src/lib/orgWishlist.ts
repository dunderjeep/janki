/**
 * The wishlist: the checkboxes of one note (NOTES_WISHLIST, default wishlist.org).
 */
import { editText, noteAt, orgText } from 'notes/server'
import { appendCheckbox, CHECKBOX, deleteCheckbox, setCheckbox } from './orgChecklist'
import { stripLinks } from './orgDailies'

export const WISHLIST_NOTE = process.env.NOTES_WISHLIST ?? 'wishlist.org'

export type WishlistItem = {
  /** Raw text as it appears after the checkbox, links and all. */
  raw: string
  /** Human label with link syntax stripped. */
  label: string
  done: boolean
  /** 1-based line in the note's text. */
  line: number
}

export type Wishlist = { items: WishlistItem[]; done: number; total: number; live: boolean }

function parse(text: string): WishlistItem[] {
  const items: WishlistItem[] = []
  text.split('\n').forEach((l, i) => {
    const m = CHECKBOX.exec(l)
    if (m) items.push({ raw: m[2], label: stripLinks(m[2]) || m[2], done: m[1] === 'X' || m[1] === 'x', line: i + 1 })
  })
  return items
}

export async function readWishlist(did: string): Promise<Wishlist> {
  const found = await noteAt(did, WISHLIST_NOTE)
  const items = found ? parse(orgText(found.note)) : []
  return { items, done: items.filter((i) => i.done).length, total: items.length, live: true }
}

export async function addWishlistItem(did: string, text: string): Promise<void> {
  if (!(await noteAt(did, WISHLIST_NOTE))) {
    const { createNote } = await import('notes/server')
    await createNote(did, WISHLIST_NOTE, '#+title: wishlist\n')
  }
  await editText(did, WISHLIST_NOTE, (t) => appendCheckbox(t, text))
}

export const setWishlistItem = (did: string, line: number, raw: string, want: 'done' | 'open') =>
  editText(did, WISHLIST_NOTE, (t) => setCheckbox(t, line, raw, want))

export const deleteWishlistItem = (did: string, line: number, raw: string) =>
  editText(did, WISHLIST_NOTE, (t) => deleteCheckbox(t, line, raw))
