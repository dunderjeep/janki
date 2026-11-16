/**
 * Scatterbrain — a writing studio. Postgres schema "scatterbrain".
 * See migration 0016 for what each table holds.
 */
import { boolean, index, integer, pgSchema, primaryKey, text, timestamp, unique, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { porcupinBoards, porcupinPins } from './porcupin'

export const scatterbrain = pgSchema('scatterbrain')

export type ItemKind = 'part' | 'act' | 'chapter' | 'scene' | 'note'
export type ItemStatus = 'idea' | 'draft' | 'revised' | 'done'

const id = () => text('id').primaryKey().$defaultFn(() => nanoid())
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const sbWorks = scatterbrain.table(
  'works',
  {
    id: id(),
    ownerUid: text('owner_uid').notNull(),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('novel'),
    logline: text('logline').notNull().default(''),
    notes: text('notes').notNull().default(''),
    targetWords: integer('target_words'),
    sessionTarget: integer('session_target'),
    sessionWords: integer('session_words').notNull().default(0),
    sessionDay: text('session_day'),
    boardId: text('board_id').references(() => porcupinBoards.id, { onDelete: 'set null' }),
    coverPinId: text('cover_pin_id').references(() => porcupinPins.id, { onDelete: 'set null' }),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }).notNull().defaultNow(),
    /** Where you were: the selected binder item and the view (write/pegboard/characters). */
    lastItemId: text('last_item_id'),
    lastView: text('last_view'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scatterbrain_works_owner_opened_idx').on(t.ownerUid, t.lastOpenedAt.desc())],
)

export const sbCharacters = scatterbrain.table(
  'characters',
  {
    id: id(),
    workId: text('work_id').notNull().references(() => sbWorks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull().default(''),
    description: text('description').notNull().default(''),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('scatterbrain_characters_work_idx').on(t.workId, t.position)],
)

export const sbItems = scatterbrain.table(
  'items',
  {
    id: id(),
    workId: text('work_id').notNull().references(() => sbWorks.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => sbItems.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ItemKind>().notNull().default('scene'),
    title: text('title').notNull(),
    synopsis: text('synopsis').notNull().default(''),
    body: text('body').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: text('status').$type<ItemStatus>().notNull().default('idea'),
    orgPath: text('org_path'),
    povCharacterId: text('pov_character_id').references(() => sbCharacters.id, { onDelete: 'set null' }),
    wordCount: integer('word_count').notNull().default(0),
    targetWords: integer('target_words'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scatterbrain_items_tree_idx').on(t.workId, t.parentId, t.position)],
)

export const sbItemCharacters = scatterbrain.table(
  'item_characters',
  {
    itemId: text('item_id').notNull().references(() => sbItems.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => sbCharacters.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.characterId] }),
    index('scatterbrain_item_characters_character_idx').on(t.characterId),
  ],
)

export const sbAttachments = scatterbrain.table(
  'attachments',
  {
    id: id(),
    workId: text('work_id').notNull().references(() => sbWorks.id, { onDelete: 'cascade' }),
    itemId: text('item_id').references(() => sbItems.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => sbCharacters.id, { onDelete: 'cascade' }),
    pinId: text('pin_id').notNull().references(() => porcupinPins.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('scatterbrain_attachments_unique').on(t.workId, t.itemId, t.characterId, t.pinId).nullsNotDistinct(),
    index('scatterbrain_attachments_pin_idx').on(t.pinId),
  ],
)

export const sbSnapshots = scatterbrain.table(
  'snapshots',
  {
    id: id(),
    itemId: text('item_id').notNull().references(() => sbItems.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'auto' | 'manual'>().notNull().default('auto'),
    label: text('label').notNull().default(''),
    body: text('body').notNull(),
    isFileText: boolean('is_file_text').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('scatterbrain_snapshots_item_idx').on(t.itemId, t.createdAt.desc())],
)
