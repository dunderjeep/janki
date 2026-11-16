/**
 * Porcupin — a personal pinboard. Postgres schema "porcupin".
 *
 *   boards      named projects; "ALL" is every pin and has no row
 *   pins        one uploaded photo
 *   pin_boards  which projects a pin is in
 *   pin_links   the Focus or Quilt graph nodes a pin is about
 */
import { pgSchema, text, integer, timestamp, index, unique, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const porcupin = pgSchema('porcupin')

export const porcupinBoards = porcupin.table(
  'boards',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('porcupin_boards_owner_name_unique').on(t.ownerUid, sql`lower(${t.name})`)],
)

export const porcupinPins = porcupin.table(
  'pins',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    storageKey: text('storage_key').notNull(),
    thumbKey: text('thumb_key'),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    width: integer('width'),
    height: integer('height'),
    title: text('title'),
    description: text('description'),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('porcupin_pins_owner_sha256_unique').on(t.ownerUid, t.sha256),
    index('porcupin_pins_owner_created_idx').on(t.ownerUid, t.createdAt.desc()),
  ],
)

export const porcupinPinBoards = porcupin.table(
  'pin_boards',
  {
    pinId: text('pin_id').notNull().references(() => porcupinPins.id, { onDelete: 'cascade' }),
    boardId: text('board_id').notNull().references(() => porcupinBoards.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pinId, t.boardId] }),
    index('porcupin_pin_boards_board_idx').on(t.boardId),
  ],
)

export const porcupinPinLinks = porcupin.table(
  'pin_links',
  {
    pinId: text('pin_id').notNull().references(() => porcupinPins.id, { onDelete: 'cascade' }),
    graph: text('graph').$type<'focus' | 'quilt'>().notNull(),
    nodeId: text('node_id').notNull(),
    nodeLabel: text('node_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pinId, t.graph, t.nodeId] }),
    index('porcupin_pin_links_node_idx').on(t.graph, t.nodeId),
  ],
)

export type PorcupinPin = typeof porcupinPins.$inferSelect
