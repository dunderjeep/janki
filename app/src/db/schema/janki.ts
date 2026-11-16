/**
 * Janki SRS — Postgres schema "janki".
 *
 * Table hierarchy:
 *   graph_nodes / graph_edges  — Quilt Graph (future canvas UI; decks+cards
 *                                 are mirrored here as node kind Deck/Card)
 *   srs_decks                  — primary deck records
 *   srs_cards                  — primary card records
 *   srs_card_states            — FSRS scheduling state (1:1 with cards, high
 *                                 write frequency kept separate)
 *   srs_sessions               — study sessions with resume-able progress blob
 *   srs_reviews                — immutable per-card review event log
 *   activity_streaks           — daily streak counter (1 row per user+activity)
 *   morse_progress             — Koch trainer level + per-letter accuracy
 *
 * Node kinds:  Deck | Card | Topic
 * Edge types:  IN_DECK | IN_TOPIC | DEFAULT_TOPIC
 *
 * SRS state values:  new | learning | relearning | review
 * Session status:    active | completed | cancelled
 * Grade values:      again | hard | good | easy
 */
import {
  pgSchema,
  text,
  boolean,
  integer,
  jsonb,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const janki = pgSchema('janki')

// ── TypeScript helper types ───────────────────────────────────────────────────

export type NodeKind =
  | 'Deck' | 'Card' | 'Topic'         // SRS (existing)
  | 'Type' | 'Property' | 'Place'     // Quilt Graph schema nodes

export type EdgeType =
  | 'IN_DECK' | 'IN_TOPIC' | 'DEFAULT_TOPIC'   // SRS (existing)
  | 'IS_A' | 'HAS_TYPE' | 'HAS_PROPERTY' | 'HAS_VALUE'  // type system
  | 'LIVES_AT' | 'WORKS_AT' | 'STUDIES_AT' | 'VISITS' | 'LOCATED_AT'  // location
  | 'RELATED_TO'  // card connections
export type SrsState = 'new' | 'learning' | 'relearning' | 'review'
export type Grade = 'again' | 'hard' | 'good' | 'easy'
export type SessionStatus = 'active' | 'completed' | 'cancelled'

/** Anything with a daily streak. Open-ended: adding one needs no migration. */
export type Activity = 'srs' | 'morse'

/** Cumulative hits/attempts for one Morse character. */
export type LetterAccuracy = { hits: number; total: number }

export type SrsObject = {
  state: SrsState
  dueAt: string        // ISO timestamp
  lastReviewedAt: string | null
  stability: number
  difficulty: number
  reps: number
  lapses: number
}

export type FsrsParams = {
  maxIntervalDays?: number   // hard cap in days (default 365)
  initEF?: number            // starting ease factor (default 1.75)
  efDecay?: number           // EF reduction per Good review (default 0.04)
  efHardLoss?: number        // EF reduction on Hard (default 0.15)
  efEasyGain?: number        // EF increase on Easy (default 0.10)
  efMin?: number             // EF floor (default 1.30)
  efMax?: number             // EF ceiling (default 2.50)
}

export type SessionProgress = {
  sessionQueue: string[]
  cursor: number
  sessionSource: 'due' | 'upcoming'
  cardUpdates: Record<string, SrsObject>
  reviews: Array<{
    cardId: string
    grade: Grade
    reviewedAt: string
  }>
  dueSeedIds: string[]
}

// ── graph_nodes ───────────────────────────────────────────────────────────────
export const graphNodes = janki.table(
  'graph_nodes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    graphId: text('graph_id').notNull().default('default'),
    ownerUid: text('owner_uid').notNull(),
    label: text('label').notNull(),
    // props.kind: NodeKind; plus node-type-specific fields
    props: jsonb('props')
      .notNull()
      .default(sql`'{}'::jsonb`),
    // {x, y} canvas position for the future graph UI
    ui: jsonb('ui')
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Temporal fields
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    validFrom:  timestamp('valid_from',  { withTimezone: true }),
    validTo:    timestamp('valid_to',    { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('graph_nodes_owner_idx').on(t.ownerUid),
    index('graph_nodes_graph_owner_idx').on(t.graphId, t.ownerUid),
  ],
)

// ── graph_edges ───────────────────────────────────────────────────────────────
export const graphEdges = janki.table(
  'graph_edges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    graphId: text('graph_id').notNull().default('default'),
    ownerUid: text('owner_uid').notNull(),
    // EdgeType — IN_DECK | IN_TOPIC | DEFAULT_TOPIC
    type: text('type').notNull(),
    fromNodeId: text('from_node_id')
      .notNull()
      .references(() => graphNodes.id, { onDelete: 'cascade' }),
    toNodeId: text('to_node_id')
      .notNull()
      .references(() => graphNodes.id, { onDelete: 'cascade' }),
    props: jsonb('props')
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Port support for future visual flow edges
    fromPortId: text('from_port_id'),
    toPortId:   text('to_port_id'),
    // Temporal fields
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    validFrom:  timestamp('valid_from',  { withTimezone: true }),
    validTo:    timestamp('valid_to',    { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('graph_edges_from_idx').on(t.fromNodeId),
    index('graph_edges_to_idx').on(t.toNodeId),
    index('graph_edges_owner_idx').on(t.ownerUid),
    index('graph_edges_type_idx').on(t.type, t.fromNodeId),
  ],
)

// ── graph_meta ────────────────────────────────────────────────────────────────
// Key/value store for per-user graph metadata (e.g. baseTypesCreated flag)
export const graphMeta = janki.table(
  'graph_meta',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    key:      text('key').notNull(),
    value:    jsonb('value').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('graph_meta_owner_idx').on(t.ownerUid),
    uniqueIndex('graph_meta_owner_key_uidx').on(t.ownerUid, t.key),
  ],
)

// ── srs_topics ────────────────────────────────────────────────────────────────
// Self-contained knowledge topics that form a DAG (via srs_topic_parents).
// A topic can contain decks (via srs_topic_decks) and sub-topics.
export const srsTopics = janki.table(
  'srs_topics',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid:    text('owner_uid').notNull(),
    name:        text('name').notNull(),
    description: text('description').notNull().default(''),
    // false = excluded from "Study All Due" and cross-deck counts
    active:      boolean('active').notNull().default(true),
    sortOrder:   integer('sort_order').notNull().default(0),
    // optional hex color for visual coding e.g. '#6366f1'
    color:       text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('srs_topics_owner_idx').on(t.ownerUid),
  ],
)

// ── srs_topic_parents ─────────────────────────────────────────────────────────
// DAG edges: a topic can have multiple parents (many-to-many).
export const srsTopicParents = janki.table(
  'srs_topic_parents',
  {
    topicId:   text('topic_id').notNull().references(() => srsTopics.id, { onDelete: 'cascade' }),
    parentId:  text('parent_id').notNull().references(() => srsTopics.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.parentId] }),
    index('srs_topic_parents_parent_idx').on(t.parentId),
  ],
)

// ── srs_topic_decks ───────────────────────────────────────────────────────────
// Many-to-many: a deck can belong to multiple topics.
export const srsTopicDecks = janki.table(
  'srs_topic_decks',
  {
    topicId:   text('topic_id').notNull().references(() => srsTopics.id, { onDelete: 'cascade' }),
    deckId:    text('deck_id').notNull().references(() => srsDecks.id,   { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.deckId] }),
    index('srs_topic_decks_deck_idx').on(t.deckId),
  ],
)

// ── srs_decks ─────────────────────────────────────────────────────────────────
export const srsDecks = janki.table(
  'srs_decks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    // false = excluded from "Study All Due" and cross-deck counts
    active: boolean('active').notNull().default(true),
    // Per-deck FSRS parameter overrides; defaults applied in scheduleNext()
    fsrsParams: jsonb('fsrs_params')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<FsrsParams>(),
    // FK to graph_nodes.id of the corresponding Deck node
    nodeId: text('node_id'),
    // FK to graph_nodes.id of the deck's default Topic node
    defaultTopicId: text('default_topic_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('srs_decks_owner_idx').on(t.ownerUid)],
)

// ── srs_cards ─────────────────────────────────────────────────────────────────
export const srsCards = janki.table(
  'srs_cards',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    deckId: text('deck_id')
      .notNull()
      .references(() => srsDecks.id, { onDelete: 'cascade' }),
    front: text('front').notNull(),
    back: text('back').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // Alternate accepted answers (back is prepended at eval time, not stored here)
    accepted: text('accepted')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // true = exact match, false = substring match
    strict: boolean('strict').notNull().default(false),
    // Front-side media
    imageUrl: text('image_url'),
    imagePath: text('image_path'),       // MinIO object key for deletion
    audioUrl: text('audio_url'),
    audioPath: text('audio_path'),       // MinIO object key for deletion
    // Back-side media
    backImageUrl: text('back_image_url'),
    backImagePath: text('back_image_path'),
    backAudioUrl: text('back_audio_url'),
    backAudioPath: text('back_audio_path'),
    // Claude-generated Mermaid diagrams (raw syntax stored as text)
    frontDiagram: text('front_diagram'),
    backDiagram:  text('back_diagram'),
    // SVG visuals — either Claude-generated or manually pasted
    frontSvg: text('front_svg'),
    backSvg:  text('back_svg'),
    // FNV-1a 32-bit hash of (deckId || front.lower() || back.lower()) → base36
    // Used for CSV import deduplication; null for manually-created cards
    importKey: text('import_key'),
    // FK to graph_nodes.id of the corresponding Card node
    nodeId: text('node_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('srs_cards_deck_idx').on(t.deckId),
    index('srs_cards_owner_idx').on(t.ownerUid),
    // Partial unique index: only enforce dedup when importKey is set
    uniqueIndex('srs_cards_import_key_uidx')
      .on(t.deckId, t.importKey)
      .where(sql`import_key IS NOT NULL`),
  ],
)

// ── srs_card_states ───────────────────────────────────────────────────────────
// Kept as a separate 1:1 table because card states are written on every grade
// while card metadata (front, back, tags) is written rarely.
export const srsCardStates = janki.table(
  'srs_card_states',
  {
    // PK = card id (1:1)
    id: text('id')
      .primaryKey()
      .references(() => srsCards.id, { onDelete: 'cascade' }),
    ownerUid: text('owner_uid').notNull(),
    deckId: text('deck_id').notNull(),
    // Full FSRS state blob: state, dueAt, lastReviewedAt, stability, difficulty,
    // reps, lapses
    srs: jsonb('srs')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<SrsObject>(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('srs_card_states_deck_idx').on(t.deckId),
    index('srs_card_states_owner_idx').on(t.ownerUid),
    // Functional index on the dueAt timestamp inside the JSONB — allows
    // efficient "due cards" queries without a full table scan.
    // Expression index via an IMMUTABLE wrapper function (janki.parse_due_at).
    // text::timestamp is not IMMUTABLE in PG, so we wrap it. The function is
    // created by the migration SQL — Drizzle schema just declares the index name.
    index('srs_card_states_due_idx').on(
      sql`janki.parse_due_at(srs)`,
    ),
  ],
)

// ── srs_sessions ──────────────────────────────────────────────────────────────
export const srsSessions = janki.table(
  'srs_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    // null = cross-deck (MasterStudyPage)
    deckId: text('deck_id'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    // active | completed | cancelled
    status: text('status').notNull().default('active').$type<SessionStatus>(),
    targetCount: integer('target_count').notNull().default(20),
    // Ordered card id queue for the session
    cardIds: text('card_ids')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // Full resumable progress blob written on every grade
    progress: jsonb('progress')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<SessionProgress>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('srs_sessions_owner_idx').on(t.ownerUid),
    index('srs_sessions_deck_idx').on(t.deckId),
    index('srs_sessions_active_idx').on(t.ownerUid, t.status),
  ],
)

// ── srs_reviews ───────────────────────────────────────────────────────────────
// Immutable event log — one row per card grade. Never updated after insert.
export const srsReviews = janki.table(
  'srs_reviews',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    ownerUid: text('owner_uid').notNull(),
    // nullable — DueNowPage grades cards outside of a formal session
    sessionId: text('session_id'),
    deckId: text('deck_id').notNull(),
    cardId: text('card_id')
      .notNull()
      .references(() => srsCards.id, { onDelete: 'cascade' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // again | hard | good | easy
    grade: text('grade').notNull().$type<Grade>(),
    // What the user typed (after AI transcript for audio answers)
    transcript: text('transcript').notNull().default(''),
    // Raw answer before normalisation
    rawAnswer: text('raw_answer').notNull().default(''),
    // null = not evaluated (manual grade bypass)
    correct: boolean('correct'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('srs_reviews_card_idx').on(t.cardId),
    index('srs_reviews_owner_idx').on(t.ownerUid),
    index('srs_reviews_session_idx').on(t.sessionId),
    index('srs_reviews_date_idx').on(t.ownerUid, t.reviewedAt),
  ],
)

// ── activity_streaks ──────────────────────────────────────────────────────────
// One row per (user, activity) — upserted after every practice session.
// Was srs_streaks, which could only ever count SRS review; `activity` is an
// open string so a new trainer costs a new row, not a new table.
export const activityStreaks = janki.table(
  'activity_streaks',
  {
    ownerUid: text('owner_uid').notNull(),
    activity: text('activity').notNull(),   // 'srs' | 'morse'
    streakCount: integer('streak_count').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    // The user's LOCAL calendar date, YYYY-MM-DD. Never write this from
    // toISOString() — that is the UTC date and rolls the day over at 02:00 in
    // CEST. Use the helpers in src/lib/streak.ts.
    lastStudyDate: text('last_study_date').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerUid, t.activity] })],
)

export type ActivityStreak = typeof activityStreaks.$inferSelect

// ── morse_progress ────────────────────────────────────────────────────────────
// Koch trainer progress, one row per user. This lived in localStorage alone, so
// clearing site data reset the level; the per-origin split also meant that
// reaching the trainer on the LAN address got you a second, empty history.
// The daily streak is NOT here — it lives in activity_streaks, activity='morse'.
export const morseProgress = janki.table('morse_progress', {
  ownerUid: text('owner_uid').primaryKey(),
  kochLevel: integer('koch_level').notNull().default(0),
  // char → { hits, total }, cumulative across all sessions
  letterAccuracy: jsonb('letter_accuracy')
    .$type<Record<string, LetterAccuracy>>()
    .notNull()
    .default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type MorseProgress = typeof morseProgress.$inferSelect

// ══════════════════════════════════════════════════════════════════════════════
// COURSES — structured textbook learning
//
// Hierarchy:  course_books → course_chapters → course_sections → course_problems
// Problems link many-to-many to srs_cards via course_problem_cards.
// Chapter mastery gates are a curated subset of cards that must reach 'easy'.
// ══════════════════════════════════════════════════════════════════════════════

// ── course_books ──────────────────────────────────────────────────────────────
export const courseBooks = janki.table(
  'course_books',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid:  text('owner_uid').notNull(),
    title:     text('title').notNull(),
    author:    text('author').notNull().default(''),
    edition:   text('edition').notNull().default(''),
    // Path to the epub file relative to the project root (for re-parsing)
    epubPath:  text('epub_path'),
    coverUrl:  text('cover_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('course_books_owner_idx').on(t.ownerUid)],
)

// ── course_chapters ───────────────────────────────────────────────────────────
export const courseChapters = janki.table(
  'course_chapters',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    bookId:    text('book_id').notNull().references(() => courseBooks.id, { onDelete: 'cascade' }),
    number:    integer('number').notNull(),
    title:     text('title').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    // Auto-created deck for this chapter's SRS cards
    deckId:    text('deck_id').references(() => srsDecks.id, { onDelete: 'set null' }),
    // true once all gate cards reach 'easy'
    masteryUnlocked: boolean('mastery_unlocked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_chapters_book_idx').on(t.bookId),
    uniqueIndex('course_chapters_book_number_uidx').on(t.bookId, t.number),
  ],
)

// ── course_sections ───────────────────────────────────────────────────────────
export const courseSections = janki.table(
  'course_sections',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    chapterId:  text('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
    // e.g. "1.1", "1.2"
    number:     text('number').notNull(),
    title:      text('title').notNull(),
    sortOrder:  integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_sections_chapter_idx').on(t.chapterId),
  ],
)

// ── course_problems ───────────────────────────────────────────────────────────
export type ProblemSubPart = { label: string; text: string }
export type TechniqueTag =
  | 'logical_form'
  | 'truth_table'
  | 'proof_by_contradiction'
  | 'proof_by_contrapositive'
  | 'direct_proof'
  | 'induction'
  | 'existential_proof'
  | 'uniqueness_proof'
  | 'set_theory'
  | 'quantifiers'
  | 'biconditional'
  | 'disjunction'
  | 'conjunction'
  | 'equivalence'
  | string  // open for Claude to add new ones

export const courseProblems = janki.table(
  'course_problems',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    sectionId:  text('section_id').notNull().references(() => courseSections.id, { onDelete: 'cascade' }),
    // epub element id, e.g. "exe1-1-3" — unique within a book
    sourceId:   text('source_id'),
    number:     text('number').notNull(),
    isStarred:  boolean('is_starred').notNull().default(false),
    statement:  text('statement').notNull(),
    // [{label:"a", text:"..."}, ...]
    subParts:   jsonb('sub_parts').notNull().default(sql`'[]'::jsonb`).$type<ProblemSubPart[]>(),
    // Claude-enriched fields (null until enriched)
    situation:        text('situation'),       // "when would you use this"
    trick:            text('trick'),           // the unlocking sentence
    techniqueTag:     text('technique_tag'),   // primary technique
    techniqueTags:    text('technique_tags').array().notNull().default(sql`ARRAY[]::text[]`),
    solutionSketch:   text('solution_sketch'), // from answer key
    // Variant support: null = original problem
    parentId:   text('parent_id'),             // self-ref, added as FK via migration
    variantNote: text('variant_note'),         // e.g. "easier version: only 2 variables"
    // Struggle window: minutes before the "Reveal trick" button appears
    revealAfterMinutes: integer('reveal_after_minutes').notNull().default(5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_problems_section_idx').on(t.sectionId),
    index('course_problems_parent_idx').on(t.parentId),
  ],
)

// ── course_problem_cards ──────────────────────────────────────────────────────
// Many-to-many: a problem generates multiple SRS cards; a card can come from
// multiple problems (same technique appearing in different problems).
export type ProblemCardRole = 'situation' | 'technique' | 'fact' | 'variant'

export const courseProblemCards = janki.table(
  'course_problem_cards',
  {
    problemId: text('problem_id').notNull().references(() => courseProblems.id, { onDelete: 'cascade' }),
    cardId:    text('card_id').notNull().references(() => srsCards.id, { onDelete: 'cascade' }),
    // What kind of card this is relative to the problem
    cardRole:  text('card_role').notNull().default('fact').$type<ProblemCardRole>(),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.cardId] }),
    index('course_problem_cards_card_idx').on(t.cardId),
  ],
)

// ── course_chapter_gates ──────────────────────────────────────────────────────
// Curated set of cards that must all reach grade='easy' before
// masteryUnlocked flips to true for the chapter.
export const courseChapterGates = janki.table(
  'course_chapter_gates',
  {
    chapterId: text('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
    cardId:    text('card_id').notNull().references(() => srsCards.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.chapterId, t.cardId] }),
    index('course_chapter_gates_card_idx').on(t.cardId),
  ],
)

// ── course_section_blocks ─────────────────────────────────────────────────────
// Structured reading content extracted from the epub, one block per paragraph
// / example / definition / figure. Stored in order (sortOrder).
export type BlockKind =
  | 'para'         // regular paragraph
  | 'example'      // "Example 1.1.1." — has an id and label
  | 'definition'   // "Definition ..."
  | 'theorem'      // "Theorem ..."  (Velleman uses class="Theorem" for all three)
  | 'list_item'    // numbered/bulleted item inside an example
  | 'equation'     // inline or display equation (image or unicode)
  | 'figure'       // image with optional caption
  | 'indented'     // indented block (argument form, quoted text)

export type ContentBlock = {
  kind: BlockKind
  text: string           // plain text content (unicode math preserved)
  html: string           // original HTML snippet for faithful rendering
  label?: string         // e.g. "Example 1.1.1" for theorem blocks
  sourceId?: string      // epub element id, e.g. "s1-1-1"
  imageRef?: string      // epub image path for figures/equations
}

export const courseSectionBlocks = janki.table(
  'course_section_blocks',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    sectionId:  text('section_id').notNull().references(() => courseSections.id, { onDelete: 'cascade' }),
    sortOrder:  integer('sort_order').notNull().default(0),
    kind:       text('kind').notNull().$type<BlockKind>(),
    // Plain text for search + annotation offsets
    textContent: text('text_content').notNull().default(''),
    // Original HTML snippet — rendered directly in the reading view
    html:       text('html').notNull().default(''),
    // For examples, definitions, theorems
    label:      text('label'),
    sourceId:   text('source_id'),
    // For figures and equation images
    imageRef:   text('image_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_section_blocks_section_idx').on(t.sectionId),
  ],
)

// ── course_annotations ────────────────────────────────────────────────────────
// User highlights on reading content blocks. A highlight can optionally link
// to an SRS card (creating a wiki-style concept link).
export const courseAnnotations = janki.table(
  'course_annotations',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid:  text('owner_uid').notNull(),
    blockId:   text('block_id').notNull().references(() => courseSectionBlocks.id, { onDelete: 'cascade' }),
    // Character offsets within block.textContent
    offsetStart: integer('offset_start').notNull(),
    offsetEnd:   integer('offset_end').notNull(),
    // The highlighted text itself (denormalized for display)
    selectedText: text('selected_text').notNull(),
    // Optional note the user added to the highlight
    note:      text('note').notNull().default(''),
    // Optional link to an SRS card — the "wiki link" connection
    cardId:    text('card_id').references(() => srsCards.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_annotations_owner_idx').on(t.ownerUid),
    index('course_annotations_block_idx').on(t.blockId),
    index('course_annotations_card_idx').on(t.cardId),
  ],
)

// ── course_clarifications ─────────────────────────────────────────────────────
// "Ask Claude" questions anchored to a content block. Stored so your
// personal "confused here" log persists and accumulates.
export const courseClarifications = janki.table(
  'course_clarifications',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid:  text('owner_uid').notNull(),
    blockId:   text('block_id').notNull().references(() => courseSectionBlocks.id, { onDelete: 'cascade' }),
    question:  text('question').notNull(),
    answer:    text('answer').notNull().default(''),
    // The block's text was included as context in the Claude prompt
    contextText: text('context_text').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_clarifications_owner_idx').on(t.ownerUid),
    index('course_clarifications_block_idx').on(t.blockId),
  ],
)

// ── course_problem_attempts ───────────────────────────────────────────────────
// One row per attempt. Drives the struggle timer and progress tracking.
export type AttemptOutcome = 'in_progress' | 'solved' | 'gave_up'

export const courseProblemAttempts = janki.table(
  'course_problem_attempts',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerUid:    text('owner_uid').notNull(),
    problemId:   text('problem_id').notNull().references(() => courseProblems.id, { onDelete: 'cascade' }),
    startedAt:   timestamp('started_at',   { withTimezone: true }).notNull().defaultNow(),
    // Set when user clicks "Reveal trick"
    revealedAt:  timestamp('revealed_at',  { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcome:     text('outcome').notNull().default('in_progress').$type<AttemptOutcome>(),
    notes:       text('notes').notNull().default(''),
    createdAt:   timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('course_problem_attempts_owner_idx').on(t.ownerUid),
    index('course_problem_attempts_problem_idx').on(t.problemId),
  ],
)


// ── quilt_positions ───────────────────────────────────────────────────────────
//
// Where an org-roam note sits on the Quilt canvas.
//
// This is the whole reason the canvas is worth pointing at org-roam: org-roam-ui
// re-runs a force simulation on every load, so an arrangement you made by hand
// is gone by tomorrow. Emacs stays the source of truth for the notes themselves
// — janki never writes a .org file from here — and owns nothing but the layout.
//
// Keyed by the org id rather than by any janki row, so notes can be renamed,
// moved between files, or re-indexed without losing their place. A row whose
// org id no longer resolves is harmless: it is simply never read.
export const quiltPositions = janki.table(
  'quilt_positions',
  {
    ownerUid: text('owner_uid').notNull(),
    orgId:    text('org_id').notNull(),
    // x/y are where the note last rendered. They are kept because they are what
    // a drag produces and what drift is measured against, but they are not what
    // a placement *means* — see angle/bandT below.
    x:        doublePrecision('x').notNull(),
    y:        doublePrecision('y').notNull(),
    // What the drag meant: this far round the circle, this far across that
    // ring's band. Stored so that resizing a band carries its notes with it
    // rather than leaving them behind for a wider neighbour to swallow.
    angle:      doublePrecision('angle'),
    bandT:      doublePrecision('band_t'),
    placedRing: integer('placed_ring'),
    // Pinned nodes keep their place when a re-layout runs over everything else.
    pinned:   boolean('pinned').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerUid, t.orgId] }),
  ],
)
