/**
 * The note record, as lexicons/com/dunderjeep/janki/note.json defines it.
 * Change the two together.
 */

export const NOTE = 'com.dunderjeep.janki.note'

export type Property = { key: string; value: string }

export type Timestamp = {
  active: boolean
  /** YYYY-MM-DD */
  date: string
  /** The day name as written ("Sun"); kept so a note in another language reads back as it was. */
  day?: string
  /** HH:MM */
  time?: string
  endTime?: string
  /** +1w, ++1d, .+1m, .+2d/4d */
  repeat?: string
  /** -2d, --1d */
  warning?: string
}

/** An ATProto blob reference: the file's content ID, type and size. Its bytes live in the host's blob store. */
export type BlobRef = { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }

export type Attachment = { name: string; blob: BlobRef; addedAt: string }

export type Heading = {
  level: number
  todo?: string
  priority?: string
  title: string
  tags?: string[]
  scheduled?: Timestamp
  deadline?: Timestamp
  closed?: Timestamp
  properties?: Property[]
  /** Files attached to this heading. Written in org as :ATTACHMENT: lines in the drawer. */
  attachments?: Attachment[]
  /** Text up to the next heading. Absent: no lines at all. "": one empty line. */
  body?: string
}

export type NoteRecord = {
  $type: typeof NOTE
  title: string
  path?: string
  tags?: string[]
  properties?: Property[]
  body?: string
  headings: Heading[]
  createdAt: string
  updatedAt?: string
}

/** A note as it lives in the store: its address and its value. */
export type StoredNote = { uri: string; rkey: string; value: NoteRecord }
