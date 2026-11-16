-- ── course_books ──────────────────────────────────────────────────────────────
CREATE TABLE "janki"."course_books" (
  "id"         text PRIMARY KEY NOT NULL,
  "owner_uid"  text NOT NULL,
  "title"      text NOT NULL,
  "author"     text DEFAULT '' NOT NULL,
  "edition"    text DEFAULT '' NOT NULL,
  "epub_path"  text,
  "cover_url"  text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_books_owner_idx" ON "janki"."course_books" ("owner_uid");

-- ── course_chapters ───────────────────────────────────────────────────────────
CREATE TABLE "janki"."course_chapters" (
  "id"               text PRIMARY KEY NOT NULL,
  "book_id"          text NOT NULL REFERENCES "janki"."course_books"("id") ON DELETE CASCADE,
  "number"           integer NOT NULL,
  "title"            text NOT NULL,
  "sort_order"       integer DEFAULT 0 NOT NULL,
  "deck_id"          text REFERENCES "janki"."srs_decks"("id") ON DELETE SET NULL,
  "mastery_unlocked" boolean DEFAULT false NOT NULL,
  "created_at"       timestamptz DEFAULT now() NOT NULL,
  "updated_at"       timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_chapters_book_idx" ON "janki"."course_chapters" ("book_id");
CREATE UNIQUE INDEX "course_chapters_book_number_uidx" ON "janki"."course_chapters" ("book_id", "number");

-- ── course_sections ───────────────────────────────────────────────────────────
CREATE TABLE "janki"."course_sections" (
  "id"          text PRIMARY KEY NOT NULL,
  "chapter_id"  text NOT NULL REFERENCES "janki"."course_chapters"("id") ON DELETE CASCADE,
  "number"      text NOT NULL,
  "title"       text NOT NULL,
  "sort_order"  integer DEFAULT 0 NOT NULL,
  "created_at"  timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_sections_chapter_idx" ON "janki"."course_sections" ("chapter_id");

-- ── course_problems ───────────────────────────────────────────────────────────
CREATE TABLE "janki"."course_problems" (
  "id"                    text PRIMARY KEY NOT NULL,
  "section_id"            text NOT NULL REFERENCES "janki"."course_sections"("id") ON DELETE CASCADE,
  "source_id"             text,
  "number"                text NOT NULL,
  "is_starred"            boolean DEFAULT false NOT NULL,
  "statement"             text NOT NULL,
  "sub_parts"             jsonb DEFAULT '[]'::jsonb NOT NULL,
  "situation"             text,
  "trick"                 text,
  "technique_tag"         text,
  "technique_tags"        text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "solution_sketch"       text,
  "parent_id"             text REFERENCES "janki"."course_problems"("id") ON DELETE SET NULL,
  "variant_note"          text,
  "reveal_after_minutes"  integer DEFAULT 5 NOT NULL,
  "created_at"            timestamptz DEFAULT now() NOT NULL,
  "updated_at"            timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_problems_section_idx"  ON "janki"."course_problems" ("section_id");
CREATE INDEX "course_problems_parent_idx"   ON "janki"."course_problems" ("parent_id");

-- ── course_problem_cards ──────────────────────────────────────────────────────
CREATE TABLE "janki"."course_problem_cards" (
  "problem_id" text NOT NULL REFERENCES "janki"."course_problems"("id") ON DELETE CASCADE,
  "card_id"    text NOT NULL REFERENCES "janki"."srs_cards"("id") ON DELETE CASCADE,
  "card_role"  text DEFAULT 'fact' NOT NULL,
  PRIMARY KEY ("problem_id", "card_id")
);
CREATE INDEX "course_problem_cards_card_idx" ON "janki"."course_problem_cards" ("card_id");

-- ── course_chapter_gates ──────────────────────────────────────────────────────
CREATE TABLE "janki"."course_chapter_gates" (
  "chapter_id" text NOT NULL REFERENCES "janki"."course_chapters"("id") ON DELETE CASCADE,
  "card_id"    text NOT NULL REFERENCES "janki"."srs_cards"("id") ON DELETE CASCADE,
  "sort_order" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("chapter_id", "card_id")
);
CREATE INDEX "course_chapter_gates_card_idx" ON "janki"."course_chapter_gates" ("card_id");

-- ── course_problem_attempts ───────────────────────────────────────────────────
CREATE TABLE "janki"."course_problem_attempts" (
  "id"           text PRIMARY KEY NOT NULL,
  "owner_uid"    text NOT NULL,
  "problem_id"   text NOT NULL REFERENCES "janki"."course_problems"("id") ON DELETE CASCADE,
  "started_at"   timestamptz DEFAULT now() NOT NULL,
  "revealed_at"  timestamptz,
  "completed_at" timestamptz,
  "outcome"      text DEFAULT 'in_progress' NOT NULL,
  "notes"        text DEFAULT '' NOT NULL,
  "created_at"   timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_problem_attempts_owner_idx"   ON "janki"."course_problem_attempts" ("owner_uid");
CREATE INDEX "course_problem_attempts_problem_idx" ON "janki"."course_problem_attempts" ("problem_id");
