-- ── course_section_blocks ─────────────────────────────────────────────────────
CREATE TABLE "janki"."course_section_blocks" (
  "id"           text PRIMARY KEY NOT NULL,
  "section_id"   text NOT NULL REFERENCES "janki"."course_sections"("id") ON DELETE CASCADE,
  "sort_order"   integer DEFAULT 0 NOT NULL,
  "kind"         text NOT NULL,
  "text_content" text DEFAULT '' NOT NULL,
  "html"         text DEFAULT '' NOT NULL,
  "label"        text,
  "source_id"    text,
  "image_ref"    text,
  "created_at"   timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_section_blocks_section_idx" ON "janki"."course_section_blocks" ("section_id");

-- ── course_annotations ────────────────────────────────────────────────────────
CREATE TABLE "janki"."course_annotations" (
  "id"            text PRIMARY KEY NOT NULL,
  "owner_uid"     text NOT NULL,
  "block_id"      text NOT NULL REFERENCES "janki"."course_section_blocks"("id") ON DELETE CASCADE,
  "offset_start"  integer NOT NULL,
  "offset_end"    integer NOT NULL,
  "selected_text" text NOT NULL,
  "note"          text DEFAULT '' NOT NULL,
  "card_id"       text REFERENCES "janki"."srs_cards"("id") ON DELETE SET NULL,
  "created_at"    timestamptz DEFAULT now() NOT NULL,
  "updated_at"    timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_annotations_owner_idx" ON "janki"."course_annotations" ("owner_uid");
CREATE INDEX "course_annotations_block_idx" ON "janki"."course_annotations" ("block_id");
CREATE INDEX "course_annotations_card_idx"  ON "janki"."course_annotations" ("card_id");

-- ── course_clarifications ─────────────────────────────────────────────────────
CREATE TABLE "janki"."course_clarifications" (
  "id"           text PRIMARY KEY NOT NULL,
  "owner_uid"    text NOT NULL,
  "block_id"     text NOT NULL REFERENCES "janki"."course_section_blocks"("id") ON DELETE CASCADE,
  "question"     text NOT NULL,
  "answer"       text DEFAULT '' NOT NULL,
  "context_text" text DEFAULT '' NOT NULL,
  "created_at"   timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "course_clarifications_owner_idx" ON "janki"."course_clarifications" ("owner_uid");
CREATE INDEX "course_clarifications_block_idx" ON "janki"."course_clarifications" ("block_id");
