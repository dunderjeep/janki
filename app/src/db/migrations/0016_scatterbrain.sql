-- Scatterbrain — a writing studio with many works on the go.
--
--   works            one book or piece of writing
--   items            its binder: parts, acts, chapters, scenes, notes
--   characters       the people in a work
--   attachments      Porcupin pins hung on a work, a binder item or a character
--   item_characters  who appears in which scene
--   snapshots        earlier versions of an item's text
--
-- An item's text is in items.body unless org_path is set, in which case the
-- file under the org directory is the only copy and body stays empty.

CREATE SCHEMA IF NOT EXISTS "scatterbrain";

CREATE TABLE "scatterbrain"."works" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_uid" text NOT NULL,
  "title" text NOT NULL,
  "kind" text DEFAULT 'novel' NOT NULL,
  "logline" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "target_words" integer,
  -- Created on the first image, so a work with none adds nothing to Porcupin.
  "board_id" text REFERENCES "porcupin"."boards" ("id") ON DELETE SET NULL,
  "cover_pin_id" text REFERENCES "porcupin"."pins" ("id") ON DELETE SET NULL,
  "last_opened_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "scatterbrain_works_owner_opened_idx"
  ON "scatterbrain"."works" ("owner_uid", "last_opened_at" DESC);

CREATE TABLE "scatterbrain"."characters" (
  "id" text PRIMARY KEY NOT NULL,
  "work_id" text NOT NULL REFERENCES "scatterbrain"."works" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "scatterbrain_characters_work_idx" ON "scatterbrain"."characters" ("work_id", "position");

CREATE TABLE "scatterbrain"."items" (
  "id" text PRIMARY KEY NOT NULL,
  "work_id" text NOT NULL REFERENCES "scatterbrain"."works" ("id") ON DELETE CASCADE,
  "parent_id" text REFERENCES "scatterbrain"."items" ("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'scene' NOT NULL CHECK ("kind" IN ('part', 'act', 'chapter', 'scene', 'note')),
  "title" text NOT NULL,
  "synopsis" text DEFAULT '' NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'idea' NOT NULL CHECK ("status" IN ('idea', 'draft', 'revised', 'done')),
  "org_path" text,                    -- relative to the org directory
  "pov_character_id" text REFERENCES "scatterbrain"."characters" ("id") ON DELETE SET NULL,
  "word_count" integer DEFAULT 0 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "scatterbrain_items_tree_idx" ON "scatterbrain"."items" ("work_id", "parent_id", "position");

CREATE TABLE "scatterbrain"."item_characters" (
  "item_id" text NOT NULL REFERENCES "scatterbrain"."items" ("id") ON DELETE CASCADE,
  "character_id" text NOT NULL REFERENCES "scatterbrain"."characters" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("item_id", "character_id")
);
CREATE INDEX "scatterbrain_item_characters_character_idx" ON "scatterbrain"."item_characters" ("character_id");

CREATE TABLE "scatterbrain"."attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "work_id" text NOT NULL REFERENCES "scatterbrain"."works" ("id") ON DELETE CASCADE,
  "item_id" text REFERENCES "scatterbrain"."items" ("id") ON DELETE CASCADE,
  "character_id" text REFERENCES "scatterbrain"."characters" ("id") ON DELETE CASCADE,
  "pin_id" text NOT NULL REFERENCES "porcupin"."pins" ("id") ON DELETE CASCADE,
  "caption" text DEFAULT '' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "scatterbrain_attachments_one_target" CHECK ("item_id" IS NULL OR "character_id" IS NULL),
  CONSTRAINT "scatterbrain_attachments_unique" UNIQUE NULLS NOT DISTINCT ("work_id", "item_id", "character_id", "pin_id")
);
CREATE INDEX "scatterbrain_attachments_pin_idx" ON "scatterbrain"."attachments" ("pin_id");

CREATE TABLE "scatterbrain"."snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL REFERENCES "scatterbrain"."items" ("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'auto' NOT NULL CHECK ("kind" IN ('auto', 'manual')),
  "label" text DEFAULT '' NOT NULL,
  "body" text NOT NULL,
  "is_file_text" boolean DEFAULT false NOT NULL,  -- raw file contents rather than Markdown
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "scatterbrain_snapshots_item_idx" ON "scatterbrain"."snapshots" ("item_id", "created_at" DESC);
